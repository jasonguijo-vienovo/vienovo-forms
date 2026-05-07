import {
  appendSpreadsheetRow,
  ensureSpreadsheetSheet,
  readSpreadsheetMatrix,
  writeSpreadsheetRow,
} from "@/lib/google/sheets";

type RowValues = Record<string, unknown>;

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
  labels?: Record<string, string>;
  values: Record<string, unknown>;
}) {
  const submittedAt = opts.submittedAt ?? new Date();
  const timestampText = submittedAt.toLocaleString("en-PH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Manila",
  });

  return {
    Timestamp: timestampText,
    Status: opts.status || "submitted",
    ...flattenObject(opts.values, "", opts.labels ?? {}),
  };
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

  const rowEntries = Object.entries(opts.rowValues);
  const missingHeaders = rowEntries
    .map(([header]) => header)
    .filter((header) => header && !headers.includes(header));

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

  const row = headers.map((header) => flattenValue(opts.rowValues[header]));
  await appendSpreadsheetRow({
    spreadsheetId,
    sheetTitle,
    values: row,
  });
}
