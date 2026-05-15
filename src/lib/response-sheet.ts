import {
  appendSpreadsheetRow,
  ensureSpreadsheetSheet,
  readSpreadsheetMatrix,
  writeSpreadsheetRow,
} from "@/lib/google/sheets";

type RowValues = Record<string, unknown>;

const META_HEADER_ALIASES: Record<string, string[]> = {
  Timestamp: ["Timestamp", "Submitted At", "Date Submitted", "Created At"],
  "Ref #": ["Ref #", "Reference", "Ref", "RefID", "Request ID", "Request No", "Reference No", "Reference #"],
  "Submitted By Email": [
    "Submitted By Email",
    "Requester Email",
    "Requestor Email",
    "Request By Email",
    "Submitted Email",
  ],
  "Submitted By Name": [
    "Submitted By Name",
    "Requester Name",
    "Requestor Name",
    "Requested By",
    "Submitted By",
    "Requester",
  ],
  Status: ["Status"],
};

function toColumnLetters(columnNumber: number) {
  let n = columnNumber;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function normalizeHeader(value: string) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildTimestampText(value: Date) {
  return value.toLocaleString("en-PH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Manila",
  });
}

function normalizeReference(value: string) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function titleCaseFromKey(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function flattenValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => flattenValue(item)).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function flattenObject(
  source: Record<string, unknown>,
  prefix = "",
  labels: Record<string, string> = {},
  target: RowValues = {},
) {
  for (const [key, rawValue] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (
      rawValue &&
      typeof rawValue === "object" &&
      !Array.isArray(rawValue) &&
      !(rawValue instanceof Date)
    ) {
      flattenObject(rawValue as Record<string, unknown>, path, labels, target);
      continue;
    }
    const label = labels[path] || labels[key] || titleCaseFromKey(path);
    target[label] = flattenValue(rawValue);
  }
  return target;
}

export function buildResponseSheetRows(opts: {
  referenceNo: string;
  formSlug: string;
  formName: string;
  submittedByEmail: string;
  submittedByName: string;
  status?: string;
  submittedAt?: Date;
  requestVersion?: number;
  requestRevisionStatus?: string;
  requestRevisionNote?: string;
  labels?: Record<string, string>;
  values: Record<string, unknown>;
}) {
  const submittedAt = opts.submittedAt ?? new Date();
  const timestampText = buildTimestampText(submittedAt);

  return {
    Timestamp: timestampText,
    "Ref #": opts.referenceNo,
    "Form Slug": opts.formSlug,
    "Form Name": opts.formName,
    "Submitted By Email": opts.submittedByEmail,
    "Submitted By Name": opts.submittedByName,
    Status: opts.status || "submitted",
    "Request Version": opts.requestVersion ? `Version ${opts.requestVersion}` : "",
    "Request Revision Status": opts.requestRevisionStatus || "",
    "Request Revision Note": opts.requestRevisionNote || "",
    ...flattenObject(opts.values, "", opts.labels ?? {}),
  };
}

function hasEquivalentExistingHeader(header: string, existingHeaders: string[]) {
  const aliases = META_HEADER_ALIASES[header];
  if (!aliases) return existingHeaders.includes(header);
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  return existingHeaders.some((item) => normalizedAliases.has(normalizeHeader(item)));
}

function projectRowValuesToExistingHeaders(rowValues: RowValues, existingHeaders: string[]) {
  const projected: RowValues = { ...rowValues };
  for (const [sourceHeader, aliases] of Object.entries(META_HEADER_ALIASES)) {
    const sourceValue = rowValues[sourceHeader];
    if (sourceValue == null || sourceValue === "") continue;
    const normalizedAliases = new Set(aliases.map(normalizeHeader));
    for (const header of existingHeaders) {
      const normalizedHeader = normalizeHeader(header);
      if (!normalizedAliases.has(normalizedHeader)) continue;
      if (projected[header] == null || projected[header] === "") {
        projected[header] = sourceValue;
      }
      if (
        sourceHeader === "Timestamp" &&
        ["lastupdated", "updatedat", "lastmodified"].includes(normalizedHeader) &&
        (projected[header] == null || projected[header] === "")
      ) {
        projected[header] = sourceValue;
      }
    }
  }

  for (const header of existingHeaders) {
    const normalizedHeader = normalizeHeader(header);
    if (!["lastupdated", "updatedat", "lastmodified"].includes(normalizedHeader)) continue;
    if (projected[header] == null || projected[header] === "") {
      projected[header] = rowValues.Timestamp ?? "";
    }
  }

  return projected;
}

export async function appendResponseSheetRow(opts: {
  spreadsheetId: string;
  sheetTitle: string;
  rowValues: RowValues;
}) {
  const spreadsheetId = opts.spreadsheetId.trim();
  const sheetTitle = opts.sheetTitle.trim();
  if (!spreadsheetId || !sheetTitle) return;

  await ensureSpreadsheetSheet(spreadsheetId, sheetTitle);
  let headers = (await readSpreadsheetMatrix(spreadsheetId, `${sheetTitle}!A1:ZZ1`))[0]?.map((value) =>
    String(value ?? "").trim(),
  ) ?? [];

  const normalizedRowValues = headers.length > 0
    ? projectRowValuesToExistingHeaders(opts.rowValues, headers)
    : opts.rowValues;
  const rowEntries = Object.entries(normalizedRowValues);
  const missingHeaders = rowEntries
    .map(([header]) => header)
    .filter((header) => header && !headers.includes(header))
    .filter((header) => !hasEquivalentExistingHeader(header, headers));

  if (headers.length === 0) {
    headers = rowEntries.map(([header]) => header);
    await writeSpreadsheetRow({
      spreadsheetId,
      range: `${sheetTitle}!A1`,
      values: headers,
    });
  } else if (missingHeaders.length > 0) {
    headers = [...headers, ...missingHeaders];
    await writeSpreadsheetRow({
      spreadsheetId,
      range: `${sheetTitle}!A1`,
      values: headers,
    });
  }

  const row = headers.map((header) => flattenValue(normalizedRowValues[header]));
  await appendSpreadsheetRow({
    spreadsheetId,
    sheetTitle,
    values: row,
  });
}

export async function updateResponseSheetStatusByReference(opts: {
  spreadsheetId: string;
  sheetTitle: string;
  referenceNo: string;
  status: "pending" | "approved" | "rejected" | "returned";
}) {
  const spreadsheetId = opts.spreadsheetId.trim();
  const sheetTitle = opts.sheetTitle.trim();
  const referenceNo = opts.referenceNo.trim();
  const normalizedReference = normalizeReference(referenceNo);
  if (!spreadsheetId || !sheetTitle || !referenceNo) return false;

  const rows = await readSpreadsheetMatrix(spreadsheetId, `${sheetTitle}!A1:ZZ5000`);
  if (!rows.length) return false;

  let headers = rows[0].map((value) => String(value ?? "").trim());
  let normalizedHeaders = headers.map(normalizeHeader);
  const refCol = normalizedHeaders.findIndex((header) =>
    ["ref", "refno", "refnumber", "referenceno", "reference", "referenceid", "requestid", "requestno"].includes(header),
  );
  let statusCol = normalizedHeaders.findIndex((header) => header === "status");
  const lastUpdatedCol = normalizedHeaders.findIndex((header) =>
    ["lastupdated", "updatedat", "lastmodified"].includes(header),
  );
  if (refCol < 0) return false;
  if (statusCol < 0) {
    headers = [...headers, "Status"];
    await writeSpreadsheetRow({
      spreadsheetId,
      range: `${sheetTitle}!A1`,
      values: headers,
    });
    normalizedHeaders = headers.map(normalizeHeader);
    statusCol = normalizedHeaders.findIndex((header) => header === "status");
    if (statusCol < 0) return false;
  }

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const rowRef = String(rows[rowIndex]?.[refCol] ?? "").trim();
    const normalizedRowRef = normalizeReference(rowRef);
    if (rowRef !== referenceNo && normalizedRowRef !== normalizedReference) continue;
    const rowNumber = rowIndex + 1;
    const colLetters = toColumnLetters(statusCol + 1);
    await writeSpreadsheetRow({
      spreadsheetId,
      range: `${sheetTitle}!${colLetters}${rowNumber}`,
      values: [opts.status],
    });
    if (lastUpdatedCol >= 0) {
      const lastUpdatedLetters = toColumnLetters(lastUpdatedCol + 1);
      await writeSpreadsheetRow({
        spreadsheetId,
        range: `${sheetTitle}!${lastUpdatedLetters}${rowNumber}`,
        values: [buildTimestampText(new Date())],
      });
    }
    return true;
  }

  return false;
}
