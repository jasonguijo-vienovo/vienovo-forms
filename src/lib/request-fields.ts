import { humanizeWorkflowRole } from "@/lib/workflow-routing";

export type FieldDiff = {
  from: string;
  to: string;
};

export type FieldMap = Record<string, string>;
export type FieldDisplayRow = {
  key: string;
  label: string;
  value: string;
};
export type NotificationDetailRow = {
  label: string;
  value: string;
  href?: string;
};

export type NotificationAttachmentInput = {
  label: string;
  fileName?: string;
  url?: string;
};

export type ApprovalChainNotificationInput = {
  step?: number;
  role?: string;
  approverName?: string;
  approverEmail?: string;
};

const NOTIFICATION_LABELS: Record<string, string> = {
  employeeId: "Employee ID",
  fullName: "Full name",
  firstName: "First name",
  lastName: "Last name",
  department: "Department",
  costCenter: "Cost center",
  location: "Location",
  jobTitle: "Job title",
  payablesTo: "Payable to",
  payeeName: "Payee name",
  amount: "Amount",
  reason: "Reason",
  forApprovalNote: "Approval note",
  formType: "Form type",
  totalExpenses: "Total expenses",
  cashAdvanceReferenceNo: "Cash advance ref. no.",
  dateFrom: "Date from",
  dateTo: "Date to",
  liquidationType: "Liquidation type",
  transactionNumber: "Transaction number",
  psNumber: "PS number",
  businessPartner: "Business partner",
  jvNo: "JV no.",
  landAir: "Travel type",
  tripType: "Trip type",
  origin: "Origin",
  destination: "Destination",
  departureDate: "Departure date",
  returnDate: "Return date",
  preferredTime: "Preferred Time of Departure",
  preferredReturnTime: "Preferred Time of Return",
  mc1Time: "Multi-city trip 1 preferred time of departure",
  mc2Time: "Multi-city trip 2 preferred time of departure",
  airline: "Airline",
  travelPurpose: "Travel purpose",
  baggage: "Baggage",
  hotelAccommodation: "Hotel accommodation",
  hotelOther: "Hotel details",
  servicePickup: "Service / pickup",
  activityScheduleFileName: "Activity schedule",
  supportingFileName: "Supporting file",
  approverName: "Approver",
  approverEmail: "Approver email",
  immediateSuperiorName: "Immediate superior",
  immediateSuperiorEmail: "Immediate superior email",
  departmentHeadName: "Department head",
  departmentHeadEmail: "Department head email",
  agreedToAuthorization: "Authorization confirmed",
  agreedToCertification: "Certification confirmed",
};

function s(v: unknown) {
  if (v == null) return "";
  return String(v);
}

function normalizeKey(input: string) {
  return String(input ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isHttpUrl(input: string) {
  return /^https?:\/\//i.test(String(input ?? "").trim());
}

export function humanizeFieldKey(key: string) {
  const mapped = NOTIFICATION_LABELS[key];
  if (mapped) return mapped;
  return String(key || "")
    .replace(/^expense_/, "Expense ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function buildFieldDisplayRows(
  fieldMap: FieldMap,
  options?: {
    preferredKeys?: string[];
    omitKeys?: string[];
    maxRows?: number;
  }
): FieldDisplayRow[] {
  const preferredKeys = options?.preferredKeys ?? [];
  const omitKeys = new Set(options?.omitKeys ?? []);
  const maxRows = Math.max(1, options?.maxRows ?? 12);
  const seen = new Set<string>();
  const rows: FieldDisplayRow[] = [];

  const pushRow = (key: string, value: string) => {
    const normalizedValue = String(value ?? "").trim();
    if (!normalizedValue || omitKeys.has(key) || seen.has(key)) return;
    seen.add(key);
    rows.push({
      key,
      label: humanizeFieldKey(key),
      value: normalizedValue,
    });
  };

  for (const key of preferredKeys) {
    pushRow(key, fieldMap[key] ?? "");
  }

  for (const [key, value] of Object.entries(fieldMap)) {
    pushRow(key, value);
    if (rows.length >= maxRows) break;
  }

  return rows.slice(0, maxRows);
}

export function buildNotificationDetailsFromFieldMap(
  fieldMap: FieldMap,
  options?: {
    preferredKeys?: string[];
    omitKeys?: string[];
    maxRows?: number;
  },
): NotificationDetailRow[] {
  return buildFieldDisplayRows(fieldMap, options).map(({ label, value }) => ({ label, value }));
}

export function buildAttachmentDetails(items: NotificationAttachmentInput[]): NotificationDetailRow[] {
  const normalized = items
    .map((item) => ({
      label: s(item.label) || "Attachment",
      fileName: s(item.fileName),
      url: s(item.url),
    }))
    .filter((item) => item.fileName || item.url);

  if (normalized.length === 0) {
    return [{ label: "Attachment", value: "None" }];
  }

  const rows: NotificationDetailRow[] = [];
  for (const item of normalized) {
    rows.push({
      label: item.label,
      value: item.fileName || "Attached file",
    });
    rows.push({
      label: `${item.label} Link`,
      value: item.url || "None",
      ...(item.url ? { href: item.url } : {}),
    });
  }
  return rows;
}

export function buildApprovalChainDetails(
  approvalChain: ApprovalChainNotificationInput[],
): NotificationDetailRow[] {
  return (approvalChain ?? [])
    .map((step) => {
      const roleLabel = humanizeWorkflowRole(step.role) || `Step ${step.step ?? ""}`.trim();
      const approverName = s(step.approverName).trim();
      const approverEmail = s(step.approverEmail).trim();
      const value = approverName && approverEmail ? `${approverName} (${approverEmail})` : approverName || approverEmail;
      if (!roleLabel || !value) return null;
      return {
        label: roleLabel,
        value,
      } satisfies NotificationDetailRow;
    })
    .filter((row): row is NotificationDetailRow => Boolean(row));
}

export function buildChangedFieldDetails(
  changedFields: Record<string, FieldDiff>,
  options?: {
    omitKeys?: string[];
    maxRows?: number;
  },
): NotificationDetailRow[] {
  const omitKeys = new Set(options?.omitKeys ?? []);
  const maxRows = Math.max(1, options?.maxRows ?? 6);

  return Object.entries(changedFields ?? {})
    .filter(([key]) => !omitKeys.has(key))
    .slice(0, maxRows)
    .map(([key, diff]) => ({
      label: `Updated: ${humanizeFieldKey(key)}`,
      value: `Now: ${diff.to || "(blank)"}; Was: ${diff.from || "(blank)"}`,
    }));
}

function findImportedValue(values: Record<string, unknown>, labels: Record<string, string>, ...aliases: string[]) {
  const wanted = aliases.map(normalizeKey);
  for (const alias of wanted) {
    for (const [key, rawValue] of Object.entries(values ?? {})) {
      const keyNorm = normalizeKey(key);
      const labelNorm = normalizeKey(labels?.[key] ?? "");
      if (alias === keyNorm || alias === labelNorm) {
        return s(rawValue);
      }
    }
  }
  return "";
}

export function buildImportedAttachmentDetails(formData: any): NotificationDetailRow[] {
  const labels: Record<string, string> = formData?.fieldLabels ?? {};
  const values: Record<string, unknown> = formData?.values ?? {};

  const attachmentUrl =
    findImportedValue(
      values,
      labels,
      "supportingdrivelink",
      "supporting drive link",
      "activitydrivelink",
      "activity drive link",
      "drivewebviewlink",
      "drive web view link",
      "filelink",
      "file link",
      "attachmenturl",
      "attachment url",
      "supportingdocument",
      "supporting document",
    ) || "";
  const attachmentName =
    findImportedValue(
      values,
      labels,
      "attachmentname",
      "attachment name",
      "attachmentfilename",
      "attachment file name",
      "supportingfilename",
      "supporting file name",
      "activityschedulefilename",
      "activity schedule file name",
    ) || "";

  return buildAttachmentDetails(
    isHttpUrl(attachmentUrl)
      ? [{ label: "Attachment", fileName: attachmentName || "Attached file", url: attachmentUrl }]
      : [],
  );
}

export function buildStoredRequestSummaryDetails(formSlug: string, formData: any): NotificationDetailRow[] {
  if (formSlug === "cash-advance") {
    return buildNotificationDetailsFromFieldMap(cashAdvanceFieldMap(formData), {
      preferredKeys: [
        "payablesTo",
        "payeeName",
        "amount",
        "reason",
        "forApprovalNote",
        "approverName",
        "supportingFileName",
      ],
      maxRows: 8,
    });
  }
  if (formSlug === "reimbursement") {
    return buildNotificationDetailsFromFieldMap(reimbursementFieldMap(formData), {
      preferredKeys: [
        "firstName",
        "lastName",
        "department",
        "costCenter",
        "location",
        "totalExpenses",
        "formType",
        "cashAdvanceReferenceNo",
        "immediateSuperiorName",
        "departmentHeadName",
        "reason",
      ],
      maxRows: 10,
    });
  }
  if (formSlug === "travel-booking") {
    return buildNotificationDetailsFromFieldMap(travelBookingFieldMap(formData), {
      preferredKeys: [
        "fullName",
        "employeeId",
        "department",
        "landAir",
        "tripType",
        "origin",
        "destination",
        "departureDate",
        "preferredTime",
        "returnDate",
        "preferredReturnTime",
        "immediateSuperiorName",
        "departmentHeadName",
        "travelPurpose",
      ],
      omitKeys: ["birthday", "contactNumber"],
      maxRows: 14,
    });
  }
  if (formData?.values && formData?.fieldLabels) {
    return buildNotificationDetailsFromFieldMap(importedFieldMap(formData), { maxRows: 12 });
  }
  return [];
}

export function buildStoredRequestDetailRows(formSlug: string, formData: any): FieldDisplayRow[] {
  if (formSlug === "cash-advance") {
    return buildFieldDisplayRows(cashAdvanceFieldMap(formData), {
      preferredKeys: [
        "firstName",
        "lastName",
        "payablesTo",
        "payeeName",
        "amount",
        "reason",
        "forApprovalNote",
        "approverName",
        "supportingFileName",
        "agreedToAuthorization",
      ],
      maxRows: 99,
    });
  }
  if (formSlug === "reimbursement") {
    return buildFieldDisplayRows(reimbursementFieldMap(formData), {
      preferredKeys: [
        "firstName",
        "lastName",
        "department",
        "costCenter",
        "location",
        "dateFrom",
        "dateTo",
        "formType",
        "cashAdvanceReferenceNo",
        "totalExpenses",
        "reason",
        "immediateSuperiorName",
        "departmentHeadName",
        "supportingFileName",
        "agreedToCertification",
      ],
      maxRows: 99,
    });
  }
  if (formSlug === "travel-booking") {
    return buildFieldDisplayRows(travelBookingFieldMap(formData), {
      preferredKeys: [
        "employeeId",
        "fullName",
        "department",
        "birthday",
        "contactNumber",
        "landAir",
        "tripType",
        "origin",
        "destination",
        "departureDate",
        "preferredTime",
        "returnDate",
        "preferredReturnTime",
        "mc1Origin",
        "mc1Destination",
        "mc1Date",
        "mc1Time",
        "mc2Origin",
        "mc2Destination",
        "mc2Date",
        "mc2Time",
        "airline",
        "travelPurpose",
        "baggage",
        "hotelAccommodation",
        "hotelOther",
        "servicePickup",
        "activityScheduleFileName",
        "activityDriveLink",
        "immediateSuperiorName",
        "immediateSuperiorEmail",
        "departmentHeadName",
        "departmentHeadEmail",
      ],
      maxRows: 99,
    });
  }
  if (formData?.values && formData?.fieldLabels) {
    return buildFieldDisplayRows(importedFieldMap(formData), { maxRows: 200 });
  }
  return [];
}

export function buildStoredRequestAttachmentDetails(formSlug: string, formData: any): NotificationDetailRow[] {
  if (formSlug === "cash-advance") {
    return buildAttachmentDetails([
      {
        label: "Supporting document",
        fileName: s(formData?.supportingDocument?.fileName) || s(formData?.supportingFileName),
        url: s(formData?.supportingDocument?.driveWebViewLink),
      },
    ]);
  }
  if (formSlug === "reimbursement") {
    return buildAttachmentDetails([
      {
        label: "Supporting document",
        fileName: s(formData?.supportingDocument?.fileName) || s(formData?.supportingFileName),
        url: s(formData?.supportingDocument?.driveWebViewLink),
      },
    ]);
  }
  if (formSlug === "travel-booking") {
    return buildAttachmentDetails([
      {
        label: "Activity schedule",
        fileName: s(formData?.activitySchedule?.fileName) || s(formData?.activityScheduleFileName),
        url: s(formData?.activitySchedule?.driveWebViewLink),
      },
    ]);
  }
  if (formData?.values && formData?.fieldLabels) {
    return buildImportedAttachmentDetails(formData);
  }
  return [{ label: "Attachment", value: "None" }];
}

export function formatMoney(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDisplayDate(value: unknown) {
  if (!value) return "";
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
  }

  const date = value instanceof Date ? value : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const iso = date.toISOString().slice(0, 10);
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
}

function formatDisplayTime(value: unknown) {
  const raw = s(value).trim();
  if (!raw) return "";

  const twelveHourMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])$/);
  if (twelveHourMatch) {
    const hour = Number.parseInt(twelveHourMatch[1], 10);
    const minute = twelveHourMatch[2];
    const second = twelveHourMatch[3] || "00";
    const meridiem = twelveHourMatch[4].toUpperCase();
    return `${String(hour).padStart(2, "0")}:${minute}:${second} ${meridiem}`;
  }

  const twentyFourHourMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (twentyFourHourMatch) {
    const hour24 = Number.parseInt(twentyFourHourMatch[1], 10);
    const minute = twentyFourHourMatch[2];
    const second = twentyFourHourMatch[3] || "00";
    if (hour24 >= 0 && hour24 <= 23) {
      const meridiem = hour24 >= 12 ? "PM" : "AM";
      const hour12 = hour24 % 12 || 12;
      return `${String(hour12).padStart(2, "0")}:${minute}:${second} ${meridiem}`;
    }
  }

  return raw;
}

export function travelBookingFieldMap(formData: any): FieldMap {
  const tripType = s(formData?.tripType);
  const multiCity = formData?.multiCity ?? null;
  const activity = formData?.activitySchedule ?? null;

  return {
    employeeId: s(formData?.employeeId),
    fullName: s(formData?.fullName),
    department: s(formData?.department),
    birthday: formatDisplayDate(formData?.birthday),
    contactNumber: s(formData?.contactNumber),
    landAir: s(formData?.landAir),
    tripType,
    origin: s(formData?.origin),
    destination: s(formData?.destination),
    departureDate: formatDisplayDate(formData?.departureDate),
    returnDate: formatDisplayDate(formData?.returnDate),
    preferredTime: formatDisplayTime(formData?.preferredTime),
    preferredReturnTime: formatDisplayTime(formData?.preferredReturnTime),
    mc1Origin: s(multiCity?.trip1?.origin),
    mc1Destination: s(multiCity?.trip1?.destination),
    mc1Date: formatDisplayDate(multiCity?.trip1?.date),
    mc1Time: formatDisplayTime(multiCity?.trip1?.time),
    mc2Origin: s(multiCity?.trip2?.origin),
    mc2Destination: s(multiCity?.trip2?.destination),
    mc2Date: formatDisplayDate(multiCity?.trip2?.date),
    mc2Time: formatDisplayTime(multiCity?.trip2?.time),
    airline: s(formData?.airline),
    travelPurpose: s(formData?.travelPurpose),
    baggage: s(formData?.baggage),
    hotelAccommodation: s(formData?.hotelAccommodation),
    hotelOther: s(formData?.hotelOther),
    servicePickup: s(formData?.servicePickup),
    activityScheduleFileName: s(formData?.activityScheduleFileName),
    activityDriveLink: s(activity?.driveWebViewLink),
    immediateSuperiorName: s(formData?.immediateSuperiorName),
    immediateSuperiorEmail: s(formData?.immediateSuperiorEmail),
    departmentHeadName: s(formData?.departmentHeadName),
    departmentHeadEmail: s(formData?.departmentHeadEmail),
  };
}

export function cashAdvanceFieldMap(formData: any): FieldMap {
  const supporting = formData?.supportingDocument ?? null;
  return {
    firstName: s(formData?.firstName),
    lastName: s(formData?.lastName),
    payablesTo: s(formData?.payablesTo),
    payeeName: s(formData?.payeeName),
    amount: formatMoney(formData?.amount),
    reason: s(formData?.reason),
    forApprovalNote: s(formData?.forApprovalNote),
    supportingFileName: s(formData?.supportingFileName),
    supportingDriveLink: s(supporting?.driveWebViewLink),
    approverName: s(formData?.approverName),
    approverEmail: s(formData?.approverEmail),
    agreedToAuthorization: formData?.agreedToAuthorization ? "Yes" : "",
  };
}

export function reimbursementFieldMap(formData: any): FieldMap {
  const supporting = formData?.supportingDocument ?? null;
  const expenses: Record<string, unknown> = formData?.expensesByCode ?? {};

  const map: FieldMap = {
    firstName: s(formData?.firstName),
    lastName: s(formData?.lastName),
    department: s(formData?.department),
    costCenter: s(formData?.costCenter),
    location: s(formData?.location),
    totalExpenses: formatMoney(formData?.totalExpenses),
    formType: s(formData?.formType),
    cashAdvanceReferenceNo: s(formData?.cashAdvanceReferenceNo),
    reason: s(formData?.reason),
    dateFrom: formData?.dateFrom ? new Date(formData.dateFrom).toISOString().slice(0, 10) : s(formData?.dateFrom),
    dateTo: formData?.dateTo ? new Date(formData.dateTo).toISOString().slice(0, 10) : s(formData?.dateTo),
    liquidationType: s(formData?.liquidationType),
    transactionNumber: s(formData?.transactionNumber),
    psNumber: s(formData?.psNumber),
    businessPartner: s(formData?.businessPartner),
    jvNo: s(formData?.jvNo),
    supportingFileName: s(formData?.supportingFileName),
    supportingDriveLink: s(supporting?.driveWebViewLink),
    immediateSuperiorName: s(formData?.immediateSuperiorName),
    immediateSuperiorEmail: s(formData?.immediateSuperiorEmail),
    departmentHeadName: s(formData?.departmentHeadName),
    departmentHeadEmail: s(formData?.departmentHeadEmail),
    agreedToCertification: formData?.agreedToCertification ? "Yes" : "",
  };

  for (const [code, amount] of Object.entries(expenses)) {
    const n =
      typeof amount === "number"
        ? amount
        : Number(String(amount ?? "").replace(/,/g, ""));
    map[`expense_${code.replace(/-/g, "_")}`] =
      Number.isFinite(n) && n > 0 ? formatMoney(n) : "";
  }

  return map;
}

export function importedFieldMap(formData: any): FieldMap {
  const labels: Record<string, string> = formData?.fieldLabels ?? {};
  const values: Record<string, unknown> = formData?.values ?? {};
  const map: FieldMap = {};

  for (const [name, rawValue] of Object.entries(values)) {
    const label = s(labels[name]) || name;
    const value = Array.isArray(rawValue) ? rawValue.map((item) => s(item)).join(", ") : s(rawValue);
    map[label] = value;
  }

  return map;
}

export function diffFields(prev: FieldMap, next: FieldMap): Record<string, FieldDiff> {
  const out: Record<string, FieldDiff> = {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    const from = prev[k] ?? "";
    const to = next[k] ?? "";
    if (from !== to) out[k] = { from, to };
  }
  return out;
}
