import { connectMongo } from "@/lib/db/mongo";
import { Employee } from "@/models/Employee";

type GraphUserRow = {
  id?: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  department?: string;
  employeeId?: string;
  jobTitle?: string;
  accountEnabled?: boolean;
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
};

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

function getGraphUserEmail(user: GraphUserRow) {
  return normalizeEmail(user.mail || user.userPrincipalName);
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
  ].join(",");

  const url = `https://graph.microsoft.com/v1.0/users?$select=${encodeURIComponent(select)}&$top=${pageSize}`;
  return fetchGraphCollection<GraphUserRow>(accessToken, url);
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
  const [users, deviceSummaryByEmail] = await Promise.all([
    fetchUsers(accessToken),
    fetchDeviceSummaryByEmail(accessToken),
  ]);

  await connectMongo();

  let processed = 0;
  let skipped = 0;
  let inactive = 0;
  let deviceEnriched = 0;
  const now = new Date();

  for (const user of users) {
    const email = getGraphUserEmail(user);
    if (!shouldKeepEmployee(email)) {
      skipped += 1;
      continue;
    }

    const fullName = String(user.displayName ?? "").trim();
    if (!email || !fullName) {
      skipped += 1;
      continue;
    }

    const deviceSummary = deviceSummaryByEmail.get(email);
    const isActive = user.accountEnabled !== false;
    if (!isActive) inactive += 1;
    if (deviceSummary) deviceEnriched += 1;

    await Employee.updateOne(
      { email },
      {
        $set: {
          email,
          entraUserId: String(user.id ?? "").trim(),
          fullName,
          employeeId: String(user.employeeId ?? "").trim(),
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

  return {
    processed,
    skipped,
    inactive,
    deviceEnriched,
  };
}
