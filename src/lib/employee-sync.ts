import { connectMongo } from "@/lib/db/mongo";
import { Employee } from "@/models/Employee";
import { SyncState } from "@/models/SyncState";

type GraphUserRow = {
  id?: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  department?: string;
  employeeId?: string;
  jobTitle?: string;
  accountEnabled?: boolean;
  onPremisesExtensionAttributes?: {
    extensionAttribute1?: string;
    extensionAttribute2?: string;
    extensionAttribute3?: string;
    extensionAttribute4?: string;
    extensionAttribute5?: string;
    extensionAttribute6?: string;
    extensionAttribute7?: string;
    extensionAttribute8?: string;
    extensionAttribute9?: string;
    extensionAttribute10?: string;
    extensionAttribute11?: string;
    extensionAttribute12?: string;
    extensionAttribute13?: string;
    extensionAttribute14?: string;
    extensionAttribute15?: string;
  };
  "@removed"?: {
    reason?: string;
  };
};

type GraphManagedDeviceRow = {
  userPrincipalName?: string;
  complianceState?: string;
  lastSyncDateTime?: string;
};

type GraphCollectionResponse<T> = {
  value?: T[];
  "@odata.nextLink"?: string;
};

type DeviceSummary = {
  deviceCount: number;
  compliantDeviceCount: number;
  nonCompliantDeviceCount: number;
  lastSyncAt: Date | null;
};

export type EmployeeSyncResult = {
  processed: number;
  skipped: number;
  inactive: number;
  deviceEnriched: number;
  employeeIdFallbackCount: number;
  employeeIdMissingCount: number;
  removed: number;
  syncMode: "full" | "delta";
};

type EmployeeIdResolution = {
  value: string;
  source: string;
};

const DEFAULT_EMPLOYEE_ID_FIELDS = [
  "employeeId",
  "onPremisesExtensionAttributes.extensionAttribute1",
  "onPremisesExtensionAttributes.extensionAttribute2",
  "onPremisesExtensionAttributes.extensionAttribute3",
  "onPremisesExtensionAttributes.extensionAttribute4",
  "onPremisesExtensionAttributes.extensionAttribute5",
  "onPremisesExtensionAttributes.extensionAttribute6",
  "onPremisesExtensionAttributes.extensionAttribute7",
  "onPremisesExtensionAttributes.extensionAttribute8",
  "onPremisesExtensionAttributes.extensionAttribute9",
  "onPremisesExtensionAttributes.extensionAttribute10",
  "onPremisesExtensionAttributes.extensionAttribute11",
  "onPremisesExtensionAttributes.extensionAttribute12",
  "onPremisesExtensionAttributes.extensionAttribute13",
  "onPremisesExtensionAttributes.extensionAttribute14",
  "onPremisesExtensionAttributes.extensionAttribute15",
] as const;
const EMPLOYEE_GRAPH_SYNC_KEY = "employee-graph-users";

function hasValue(value: string | undefined) {
  return Boolean(String(value ?? "").trim());
}

function asFlag(value: string | undefined, defaultValue = false) {
  if (!hasValue(value)) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeEmail(value: string | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function getAllowedDomain() {
  return String(process.env.INTUNE_ALLOWED_EMAIL_DOMAIN ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

function getScope() {
  return String(process.env.GRAPH_SCOPE ?? "https://graph.microsoft.com/.default").trim();
}

function getPageSize() {
  const raw = Number(process.env.INTUNE_SYNC_PAGE_SIZE ?? "100");
  if (!Number.isFinite(raw)) return 100;
  return Math.max(1, Math.min(999, Math.trunc(raw)));
}

function getEmployeeIdFieldOrder() {
  const configured = String(process.env.GRAPH_EMPLOYEE_ID_FIELDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured.length > 0) return configured;
  return [...DEFAULT_EMPLOYEE_ID_FIELDS];
}

export function isEmployeeDirectorySyncEnabled() {
  return asFlag(process.env.INTUNE_SYNC_ENABLED, false);
}

export function isEmployeeDirectorySyncConfigured() {
  return Boolean(
    hasValue(process.env.GRAPH_TENANT_ID) &&
      hasValue(process.env.GRAPH_CLIENT_ID) &&
      hasValue(process.env.GRAPH_CLIENT_SECRET),
  );
}

export function isEmployeeDeviceSyncEnabled() {
  return asFlag(process.env.INTUNE_SYNC_INCLUDE_DEVICES, false);
}

async function getGraphAccessToken() {
  if (!isEmployeeDirectorySyncConfigured()) {
    throw new Error("Employee sync is not configured. Set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, and GRAPH_CLIENT_SECRET.");
  }

  const tenantId = String(process.env.GRAPH_TENANT_ID).trim();
  const body = new URLSearchParams({
    client_id: String(process.env.GRAPH_CLIENT_ID).trim(),
    client_secret: String(process.env.GRAPH_CLIENT_SECRET).trim(),
    scope: getScope(),
    grant_type: "client_credentials",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to get Microsoft Graph token (${response.status}).`);
  }

  const json = (await response.json()) as { access_token?: string };
  const token = String(json.access_token ?? "").trim();
  if (!token) throw new Error("Microsoft Graph token response did not include an access token.");
  return token;
}

async function fetchGraphCollection<T>(accessToken: string, initialUrl: string) {
  const rows: T[] = [];
  let nextUrl: string | undefined = initialUrl;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Microsoft Graph request failed (${response.status}) for ${nextUrl}.`);
    }

    const json = (await response.json()) as GraphCollectionResponse<T>;
    rows.push(...(json.value ?? []));
    nextUrl = json["@odata.nextLink"];
  }

  return rows;
}

async function fetchGraphDeltaCollection<T>(accessToken: string, initialUrl: string) {
  const rows: T[] = [];
  let nextUrl: string | undefined = initialUrl;
  let deltaLink = "";

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const error = new Error(`Microsoft Graph request failed (${response.status}) for ${nextUrl}.`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }

    const json = (await response.json()) as GraphCollectionResponse<T> & { "@odata.deltaLink"?: string };
    rows.push(...(json.value ?? []));
    if (json["@odata.deltaLink"]) deltaLink = json["@odata.deltaLink"];
    nextUrl = json["@odata.nextLink"];
  }

  if (!deltaLink) {
    throw new Error("Microsoft Graph delta sync did not return a delta link.");
  }

  return { rows, deltaLink };
}

function getGraphUserEmail(user: GraphUserRow) {
  return normalizeEmail(user.mail || user.userPrincipalName);
}

function getNestedStringValue(source: unknown, path: string) {
  let current: unknown = source;
  for (const segment of path.split(".").filter(Boolean)) {
    if (!current || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[segment];
  }
  return String(current ?? "").trim();
}

function looksLikeEmployeeId(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return false;
  if (normalized.includes("@")) return false;
  if (/https?:\/\//i.test(normalized)) return false;
  if (/\s/.test(normalized)) return false;
  if (normalized.length < 3 || normalized.length > 32) return false;
  if (/^\d{4,16}$/.test(normalized)) return true;
  if (/^[a-z0-9][a-z0-9._/-]*\d[a-z0-9._/-]*$/i.test(normalized)) return true;
  return /^[a-z]{1,4}-?\d{3,16}$/i.test(normalized);
}

function resolveEmployeeId(user: GraphUserRow): EmployeeIdResolution {
  for (const fieldPath of getEmployeeIdFieldOrder()) {
    const value = getNestedStringValue(user, fieldPath);
    if (!looksLikeEmployeeId(value)) continue;
    return { value, source: fieldPath };
  }

  return { value: "", source: "" };
}

function shouldKeepEmployee(email: string) {
  if (!email) return false;
  const allowedDomain = getAllowedDomain();
  if (!allowedDomain) return true;
  return email.endsWith(`@${allowedDomain}`);
}

async function fetchUsers(accessToken: string) {
  const pageSize = getPageSize();
  const select = [
    "id",
    "displayName",
    "mail",
    "userPrincipalName",
    "department",
    "employeeId",
    "jobTitle",
    "accountEnabled",
    "onPremisesExtensionAttributes",
  ].join(",");

  await connectMongo();
  const state = await SyncState.findOne({ key: EMPLOYEE_GRAPH_SYNC_KEY })
    .select({ cursorUrl: 1 })
    .lean();
  const storedCursor = String(state?.cursorUrl ?? "").trim();
  const initialUrl =
    storedCursor ||
    `https://graph.microsoft.com/v1.0/users/delta?$select=${encodeURIComponent(select)}&$top=${pageSize}`;

  try {
    const result = await fetchGraphDeltaCollection<GraphUserRow>(accessToken, initialUrl);
    return {
      users: result.rows,
      deltaLink: result.deltaLink,
      syncMode: storedCursor ? ("delta" as const) : ("full" as const),
    };
  } catch (error) {
    const status = (error as Error & { status?: number })?.status;
    if (!storedCursor || (status !== 400 && status !== 410)) throw error;

    const fallbackUrl =
      `https://graph.microsoft.com/v1.0/users/delta?$select=${encodeURIComponent(select)}&$top=${pageSize}`;
    const result = await fetchGraphDeltaCollection<GraphUserRow>(accessToken, fallbackUrl);
    return {
      users: result.rows,
      deltaLink: result.deltaLink,
      syncMode: "full" as const,
    };
  }
}

async function fetchDeviceSummaryByEmail(accessToken: string) {
  if (!isEmployeeDeviceSyncEnabled()) return new Map<string, DeviceSummary>();

  const pageSize = getPageSize();
  const select = ["userPrincipalName", "complianceState", "lastSyncDateTime"].join(",");
  const url =
    `https://graph.microsoft.com/v1.0/deviceManagement/managedDevices` +
    `?$select=${encodeURIComponent(select)}&$top=${pageSize}`;

  const rows = await fetchGraphCollection<GraphManagedDeviceRow>(accessToken, url);
  const byEmail = new Map<string, DeviceSummary>();

  for (const row of rows) {
    const email = normalizeEmail(row.userPrincipalName);
    if (!shouldKeepEmployee(email)) continue;

    const current = byEmail.get(email) ?? {
      deviceCount: 0,
      compliantDeviceCount: 0,
      nonCompliantDeviceCount: 0,
      lastSyncAt: null,
    };

    current.deviceCount += 1;
    if (String(row.complianceState ?? "").trim().toLowerCase() === "compliant") {
      current.compliantDeviceCount += 1;
    } else {
      current.nonCompliantDeviceCount += 1;
    }

    const lastSyncAt = row.lastSyncDateTime ? new Date(row.lastSyncDateTime) : null;
    if (lastSyncAt && !Number.isNaN(lastSyncAt.getTime())) {
      current.lastSyncAt =
        !current.lastSyncAt || current.lastSyncAt < lastSyncAt ? lastSyncAt : current.lastSyncAt;
    }

    byEmail.set(email, current);
  }

  return byEmail;
}

export async function syncEmployeesFromGraph(): Promise<EmployeeSyncResult> {
  if (!isEmployeeDirectorySyncEnabled()) {
    throw new Error("Employee sync is disabled. Set INTUNE_SYNC_ENABLED=1 to allow syncing.");
  }

  const accessToken = await getGraphAccessToken();
  await connectMongo();
  await SyncState.updateOne(
    { key: EMPLOYEE_GRAPH_SYNC_KEY },
    {
      $setOnInsert: { key: EMPLOYEE_GRAPH_SYNC_KEY },
      $set: {
        lastStartedAt: new Date(),
      },
    },
    { upsert: true },
  );

  const [{ users, deltaLink, syncMode }, deviceSummaryByEmail] = await Promise.all([
    fetchUsers(accessToken),
    fetchDeviceSummaryByEmail(accessToken),
  ]);

  let processed = 0;
  let skipped = 0;
  let inactive = 0;
  let deviceEnriched = 0;
  let employeeIdFallbackCount = 0;
  let employeeIdMissingCount = 0;
  let removed = 0;
  const now = new Date();

  for (const user of users) {
    if (user["@removed"]) {
      const entraUserId = String(user.id ?? "").trim();
      if (!entraUserId) continue;

      await Employee.updateOne(
        { entraUserId },
        {
          $set: {
            isActive: false,
            lastSyncedAt: now,
            syncSource: "graph",
          },
        },
      );

      processed += 1;
      inactive += 1;
      removed += 1;
      continue;
    }

    const email = getGraphUserEmail(user);
    if (!shouldKeepEmployee(email)) {
      const entraUserId = String(user.id ?? "").trim();
      if (entraUserId) {
        await Employee.updateOne(
          { entraUserId },
          {
            $set: {
              isActive: false,
              lastSyncedAt: now,
              syncSource: "graph",
            },
          },
        );
        inactive += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const fullName = String(user.displayName ?? "").trim();
    if (!email || !fullName) {
      skipped += 1;
      continue;
    }

    const deviceSummary = deviceSummaryByEmail.get(email);
    const isActive = user.accountEnabled !== false;
    const employeeId = resolveEmployeeId(user);
    if (!isActive) inactive += 1;
    if (deviceSummary) deviceEnriched += 1;
    if (!employeeId.value) employeeIdMissingCount += 1;
    else if (employeeId.source !== "employeeId") employeeIdFallbackCount += 1;

    await Employee.updateOne(
      { email },
      {
        $set: {
          email,
          entraUserId: String(user.id ?? "").trim(),
          fullName,
          employeeId: employeeId.value,
          department: String(user.department ?? "").trim(),
          jobTitle: String(user.jobTitle ?? "").trim(),
          isActive,
          syncSource: "graph",
          lastSyncedAt: now,
          ...(deviceSummary
            ? { deviceSummary }
            : {
                deviceSummary: {
                  deviceCount: 0,
                  compliantDeviceCount: 0,
                  nonCompliantDeviceCount: 0,
                  lastSyncAt: null,
                },
              }),
        },
        $setOnInsert: {
          supervisorEmail: "",
          departmentHeadEmail: "",
        },
      },
      { upsert: true },
    );

    processed += 1;
  }

  await SyncState.updateOne(
    { key: EMPLOYEE_GRAPH_SYNC_KEY },
    {
      $setOnInsert: { key: EMPLOYEE_GRAPH_SYNC_KEY },
      $set: {
        cursorUrl: deltaLink,
        lastMode: syncMode,
        lastCompletedAt: now,
        lastSucceededAt: now,
        lastErrorAt: null,
        lastErrorMessage: "",
      },
    },
    { upsert: true },
  );

  return {
    processed,
    skipped,
    inactive,
    deviceEnriched,
    employeeIdFallbackCount,
    employeeIdMissingCount,
    removed,
    syncMode,
  };
}
