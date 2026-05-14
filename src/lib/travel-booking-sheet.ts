import {
  appendSpreadsheetRow,
  ensureSpreadsheetSheet,
  listSpreadsheetSheets,
  readSpreadsheetMatrix,
  writeSpreadsheetRow,
} from "@/lib/google/sheets";

export const TRAVEL_BOOKING_RESPONSE_HEADERS = [
  "Timestamp",
  "Status",
  "Ref #",
  "Email Address",
  "Full Name",
  "Birthday",
  "Origin",
  "Destination To",
  "Departure Date",
  "Preferred Time of Departure",
  "Multi City Departure (Optional)",
  "Multi City Deaprture Date (Optional)",
  "Preferred Time of Departure ",
  "Airlines",
  "Travel Purpose",
  "Baggage (Kg)",
  "Hotel Accommodation",
  "Immediate Superior",
  "Department Head",
  "Contact Number",
  "SERVICE/PICKUP",
  "Land/Air",
  "ID NUMBER",
  "Activity Schedule",
  "Department",
  "Request #",
] as const;

function normalizeSheetHeader(input: string) {
  return String(input || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizeSpreadsheetId(input: string) {
  const value = String(input || "").trim();
  if (!value) return "";
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] || value;
}

function formatSheetTimestamp(value: Date) {
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

function formatSheetDate(value: Date | null | undefined) {
  if (!value) return "";
  return formatDateValue(value);
}

function formatDateValue(value: Date | string | null | undefined) {
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

function formatTimeValue(value: string | null | undefined) {
  const raw = String(value || "").trim();
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

function joinNonEmpty(parts: Array<string | null | undefined>, separator: string) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(separator);
}

function buildTravelBookingMultiCityText(multiCity: any) {
  const trips = [multiCity?.trip1, multiCity?.trip2].filter(Boolean);
  return joinNonEmpty(
    trips.map((trip: any) => joinNonEmpty([trip?.origin, trip?.destination], " -> ")),
    " | ",
  );
}

function buildTravelBookingMultiCityDates(multiCity: any) {
  const trips = [multiCity?.trip1, multiCity?.trip2].filter(Boolean);
  return joinNonEmpty(
    trips.map((trip: any) => formatDateValue(trip?.date)),
    " | ",
  );
}

function buildTravelBookingMultiCityTimes(multiCity: any) {
  const trips = [multiCity?.trip1, multiCity?.trip2].filter(Boolean);
  return joinNonEmpty(
    trips.map((trip: any) => formatTimeValue(trip?.time)),
    " | ",
  );
}

export function buildTravelBookingSheetRow(input: {
  referenceNo: string;
  requestNumber: number;
  submittedByEmail: string;
  formData: any;
  submittedAt?: Date | null;
}) {
  const formData = input.formData ?? {};
  const hotelAccommodation = joinNonEmpty(
    [formData.hotelAccommodation, formData.hotelOther],
    formData.hotelAccommodation && formData.hotelOther ? " - " : "",
  );
  const attachmentValue =
    String(formData?.activitySchedule?.driveWebViewLink || "").trim() ||
    String(formData?.activitySchedule?.fileName || "").trim() ||
    String(formData?.activityScheduleFileName || "").trim();

  return [
    formatSheetTimestamp(input.submittedAt ? new Date(input.submittedAt) : new Date()),
    "pending",
    input.referenceNo,
    input.submittedByEmail,
    String(formData.fullName || "").trim(),
    formatDateValue(formData.birthday),
    String(formData.origin || "").trim(),
    String(formData.destination || "").trim(),
    formatDateValue(formData.departureDate),
    formatTimeValue(formData.preferredTime),
    buildTravelBookingMultiCityText(formData.multiCity),
    buildTravelBookingMultiCityDates(formData.multiCity),
    buildTravelBookingMultiCityTimes(formData.multiCity),
    String(formData.airline || "").trim(),
    String(formData.travelPurpose || "").trim(),
    String(formData.baggage || "").trim(),
    hotelAccommodation,
    String(formData.immediateSuperiorName || "").trim(),
    String(formData.departmentHeadName || "").trim(),
    String(formData.contactNumber || "").trim(),
    String(formData.servicePickup || "").trim(),
    String(formData.landAir || "").trim(),
    String(formData.employeeId || "").trim(),
    attachmentValue,
    String(formData.department || "").trim(),
    String(input.requestNumber),
  ];
}

export function getNextTravelBookingRequestNumber(rows: string[][], headers: string[]) {
  const requestColumnIndex = headers.findIndex((header) => normalizeSheetHeader(header) === "request");
  if (requestColumnIndex < 0) return 1;

  let maxValue = 0;
  for (const row of rows.slice(1)) {
    const raw = String(row?.[requestColumnIndex] ?? "").trim();
    const value = Number.parseInt(raw, 10);
    if (Number.isFinite(value) && value > maxValue) {
      maxValue = value;
    }
  }

  return maxValue + 1;
}

export function headersMatchExpected(headers: string[], expectedHeaders: readonly string[]) {
  return (
    headers.length >= expectedHeaders.length &&
    expectedHeaders.every(
      (header, index) => normalizeSheetHeader(headers[index]) === normalizeSheetHeader(header),
    )
  );
}

export async function resolveTravelBookingSheetTitle(
  spreadsheetId: string,
  preferredSheetTitle: string,
) {
  const expectedHeaders = [...TRAVEL_BOOKING_RESPONSE_HEADERS];
  const preferred = String(preferredSheetTitle || "").trim();
  const sheetTitles = await listSpreadsheetSheets(spreadsheetId);

  if (preferred && sheetTitles.includes(preferred)) {
    const preferredHeaders =
      (await readSpreadsheetMatrix(spreadsheetId, `${preferred}!A1:Z1`))[0] ?? [];
    if (headersMatchExpected(preferredHeaders, expectedHeaders) || preferredHeaders.length === 0) {
      return preferred;
    }
  }

  for (const title of sheetTitles) {
    const headers = (await readSpreadsheetMatrix(spreadsheetId, `${title}!A1:Z1`))[0] ?? [];
    if (headersMatchExpected(headers, expectedHeaders)) {
      return title;
    }
  }

  return preferred || "Travel Booking Responses";
}

export async function loadTravelBookingResponseSheetState(input: {
  spreadsheetId: string;
  sheetTitle: string;
}) {
  const spreadsheetId = normalizeSpreadsheetId(input.spreadsheetId);
  if (!spreadsheetId) {
    throw new Error("Travel Booking response spreadsheet ID is not configured.");
  }

  const resolvedSheetTitle = await resolveTravelBookingSheetTitle(spreadsheetId, input.sheetTitle);
  await ensureSpreadsheetSheet(spreadsheetId, resolvedSheetTitle);
  const matrix = await readSpreadsheetMatrix(spreadsheetId, `${resolvedSheetTitle}!A1:Z5000`);
  const currentHeaders = (matrix[0] ?? []).map((cell) => String(cell ?? "").trim());
  const expectedHeaders = [...TRAVEL_BOOKING_RESPONSE_HEADERS];
  const headersMatch = headersMatchExpected(currentHeaders, expectedHeaders);

  if (
    !headersMatch &&
    currentHeaders.length > 0 &&
    matrix.slice(1).some((row) => row.some((cell) => String(cell || "").trim()))
  ) {
    throw new Error(
      `Existing sheet "${resolvedSheetTitle}" does not match the expected Travel Booking headers. Update the response sheet tab in Forms Registry or align the sheet headers first.`,
    );
  }

  if (!headersMatch) {
    await writeSpreadsheetRow({
      spreadsheetId,
      range: `${resolvedSheetTitle}!A1`,
      values: expectedHeaders,
    });
  }

  return {
    spreadsheetId,
    sheetTitle: resolvedSheetTitle,
    matrix,
    headers: headersMatch && currentHeaders.length > 0 ? currentHeaders : expectedHeaders,
    extraColumnCount: headersMatch
      ? Math.max(currentHeaders.length - expectedHeaders.length, 0)
      : 0,
  };
}

export async function appendTravelBookingResponseRow(input: {
  spreadsheetId: string;
  sheetTitle: string;
  referenceNo: string;
  submittedByEmail: string;
  formData: any;
  submittedAt?: Date | null;
}) {
  const state = await loadTravelBookingResponseSheetState({
    spreadsheetId: input.spreadsheetId,
    sheetTitle: input.sheetTitle,
  });
  const requestNumber = getNextTravelBookingRequestNumber(state.matrix, state.headers);

  await appendSpreadsheetRow({
    spreadsheetId: state.spreadsheetId,
    sheetTitle: state.sheetTitle,
    values: [
      ...buildTravelBookingSheetRow({
        referenceNo: input.referenceNo,
        requestNumber,
        submittedByEmail: input.submittedByEmail,
        formData: input.formData,
        submittedAt: input.submittedAt,
      }),
      ...Array(state.extraColumnCount).fill(""),
    ],
  });

  return {
    spreadsheetId: state.spreadsheetId,
    sheetTitle: state.sheetTitle,
    requestNumber,
  };
}
