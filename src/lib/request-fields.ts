export type FieldDiff = {
  from: string;
  to: string;
};

export type FieldMap = Record<string, string>;
export type NotificationDetailRow = {
  label: string;
  value: string;
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
  preferredTime: "Preferred time",
  airline: "Airline",
  travelPurpose: "Travel purpose",
  baggage: "Baggage",
  hotelAccommodation: "Hotel accommodation",
  hotelOther: "Hotel details",
  servicePickup: "Service / pickup",
  activityScheduleFileName: "Activity schedule",
  supportingFileName: "Supporting file",
  agreedToAuthorization: "Authorization confirmed",
  agreedToCertification: "Certification confirmed",
};

function s(v: unknown) {
  if (v == null) return "";
  return String(v);
}

function humanizeFieldKey(key: string) {
  const mapped = NOTIFICATION_LABELS[key];
  if (mapped) return mapped;
  return String(key || "")
    .replace(/^expense_/, "Expense ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function buildNotificationDetailsFromFieldMap(
  fieldMap: FieldMap,
  options?: {
    preferredKeys?: string[];
    omitKeys?: string[];
    maxRows?: number;
  },
): NotificationDetailRow[] {
  const preferredKeys = options?.preferredKeys ?? [];
  const omitKeys = new Set(options?.omitKeys ?? []);
  const maxRows = Math.max(1, options?.maxRows ?? 12);
  const seen = new Set<string>();
  const rows: NotificationDetailRow[] = [];

  const pushRow = (key: string, value: string) => {
    const normalizedValue = String(value ?? "").trim();
    if (!normalizedValue || omitKeys.has(key) || seen.has(key)) return;
    seen.add(key);
    rows.push({
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

export function formatMoney(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export function travelBookingFieldMap(formData: any): FieldMap {
  const tripType = s(formData?.tripType);
  const multiCity = formData?.multiCity ?? null;
  const activity = formData?.activitySchedule ?? null;

  return {
    employeeId: s(formData?.employeeId),
    fullName: s(formData?.fullName),
    department: s(formData?.department),
    birthday: formData?.birthday ? new Date(formData.birthday).toISOString().slice(0, 10) : s(formData?.birthday),
    contactNumber: s(formData?.contactNumber),
    landAir: s(formData?.landAir),
    tripType,
    origin: s(formData?.origin),
    destination: s(formData?.destination),
    departureDate: formData?.departureDate ? new Date(formData.departureDate).toISOString().slice(0, 10) : s(formData?.departureDate),
    returnDate: formData?.returnDate ? new Date(formData.returnDate).toISOString().slice(0, 10) : s(formData?.returnDate),
    preferredTime: s(formData?.preferredTime),
    mc1Origin: s(multiCity?.trip1?.origin),
    mc1Destination: s(multiCity?.trip1?.destination),
    mc1Date: multiCity?.trip1?.date ? new Date(multiCity.trip1.date).toISOString().slice(0, 10) : s(multiCity?.trip1?.date),
    mc1Time: s(multiCity?.trip1?.time),
    mc2Origin: s(multiCity?.trip2?.origin),
    mc2Destination: s(multiCity?.trip2?.destination),
    mc2Date: multiCity?.trip2?.date ? new Date(multiCity.trip2.date).toISOString().slice(0, 10) : s(multiCity?.trip2?.date),
    mc2Time: s(multiCity?.trip2?.time),
    airline: s(formData?.airline),
    travelPurpose: s(formData?.travelPurpose),
    baggage: s(formData?.baggage),
    hotelAccommodation: s(formData?.hotelAccommodation),
    hotelOther: s(formData?.hotelOther),
    servicePickup: s(formData?.servicePickup),
    activityScheduleFileName: s(formData?.activityScheduleFileName),
    activityDriveLink: s(activity?.driveWebViewLink),
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
