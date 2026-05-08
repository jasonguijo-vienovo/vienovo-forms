"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
import { getFormUserAccess } from "@/lib/forms/runtime-state";
import { parseImportedFormHtml, type ImportedFieldDefinition } from "@/lib/imported-forms";
import { sendNotificationEmail } from "@/lib/notifications/email";
import { sendFlowNotification } from "@/lib/notifications/flow";
import { deriveRequestQueueFields } from "@/lib/request-queue";
import { generateReferenceNo } from "@/lib/reference-number";
import { syncRequestMirror } from "@/lib/request-mirror";
import { appendResponseSheetRow, buildResponseSheetRows } from "@/lib/response-sheet";
import { readSpreadsheetMatrix, writeSpreadsheetRow } from "@/lib/google/sheets";
import { RequestModel } from "@/models/Request";
import { Approver } from "@/models/Approver";
import { FormImport } from "@/models/FormImport";

const EMPLOYEE_INFORMATION_SLUG = "employee-information";
const EMPLOYEE_INFORMATION_SPREADSHEET_ID = "1-Ml75zLsLUvackWpjnitqcfJwaL1OtBBKyq7PRZ82vM";
const EMPLOYEE_INFORMATION_SHEET_NAME = "Employee Information";
const EMPLOYEE_INFORMATION_SHEET_URL = `https://docs.google.com/spreadsheets/d/${EMPLOYEE_INFORMATION_SPREADSHEET_ID}/edit?gid=1776826170#gid=1776826170`;
const EMPLOYEE_INFORMATION_HEADERS = [
  "Timestamp",
  "Ref #",
  "Employee ID",
  "Last Name",
  "First Name",
  "Middle Name",
  "Email",
  "Gender",
  "Date Of Birth",
  "Civil Status",
  "Home Address",
  "Zip Code",
  "Contact No",
  "Email Address",
  "Job Title",
  "Status",
] as const;
const SALARY_LOAN_SHEET_NAME = "Salary Loan Application";
const SALARY_LOAN_HEADERS = [
  "Timestamp",
  "Ref #",
  "Email",
  "ID Number",
  "Last Name",
  "First Name",
  "Middle Name",
  "Department",
  "Job Designation",
  "Location",
  "Date of Employment",
  "Months Tenure",
  "Manager / Supervisor",
  "Status",
] as const;

function normalizeKey(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isSalaryLoanForm(slug: string, formName: string) {
  const slugKey = normalizeKey(slug);
  const nameKey = normalizeKey(formName);
  return (
    slugKey.includes("salaryloanapplication") ||
    slugKey.includes("salaryloan") ||
    nameKey.includes("salaryloanapplication") ||
    nameKey.includes("salaryloan")
  );
}

function generateSlaCode(length = 6) {
  const pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "";
  for (let i = 0; i < length; i += 1) {
    token += pool[Math.floor(Math.random() * pool.length)];
  }
  return `SLA - ${token}`;
}

async function generateSalaryLoanReferenceNo() {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const ref = generateSlaCode(6);
    const exists = await RequestModel.exists({ referenceNo: ref });
    if (!exists) return ref;
  }
  throw new Error("Could not generate a unique Salary Loan reference number.");
}

function normalizeCompare(input: string) {
  return String(input ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildEmployeeFingerprint(row: Record<string, string>) {
  const employeeId = normalizeCompare(String(row["Employee ID"] ?? ""));
  const email = normalizeCompare(String(row.Email ?? row["Email Address"] ?? ""));
  const firstName = normalizeCompare(String(row["First Name"] ?? ""));
  return `${employeeId}|${email}|${firstName}`;
}

function findValue(values: Record<string, unknown>, labels: Record<string, string>, ...aliases: string[]) {
  const wanted = aliases.map(normalizeKey);
  for (const [key, value] of Object.entries(values)) {
    const byKey = normalizeKey(key);
    const byLabel = normalizeKey(labels[key] || "");
    if (wanted.some((alias) => alias === byKey || alias === byLabel)) return String(value ?? "").trim();
  }
  return "";
}

function buildEmployeeInformationRow(opts: {
  referenceNo: string;
  values: Record<string, unknown>;
  labels: Record<string, string>;
}) {
  const timestamp = new Date().toLocaleString("en-PH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Manila",
  });
  const letters = Array.from({ length: 3 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]);
  const numbers = Array.from({ length: 3 }, () => "0123456789"[Math.floor(Math.random() * 10)]);
  const mixed = [...letters, ...numbers]
    .sort(() => Math.random() - 0.5)
    .join("");
  const reiRef = `REI-${mixed}`;
  return {
    Timestamp: timestamp,
    "Ref #": reiRef,
    "Employee ID": findValue(opts.values, opts.labels, "employeeid", "employee id"),
    "Last Name": findValue(opts.values, opts.labels, "lastname", "last name"),
    "First Name": findValue(opts.values, opts.labels, "firstname", "first name"),
    "Middle Name": findValue(opts.values, opts.labels, "middlename", "middle name"),
    Email: findValue(opts.values, opts.labels, "email"),
    Gender: findValue(opts.values, opts.labels, "gender", "sex"),
    "Date Of Birth": findValue(opts.values, opts.labels, "dateofbirth", "birthdate", "dob"),
    "Civil Status": findValue(opts.values, opts.labels, "civilstatus", "civil status"),
    "Home Address": findValue(opts.values, opts.labels, "homeaddress", "home address", "address"),
    "Zip Code": findValue(opts.values, opts.labels, "zipcode", "zip code"),
    "Contact No": findValue(opts.values, opts.labels, "contactno", "contact number", "mobilenumber", "phone"),
    "Email Address": findValue(opts.values, opts.labels, "emailaddress", "email"),
    "Job Title": findValue(opts.values, opts.labels, "jobtitle", "position"),
    Status: "Submitted",
  } as Record<string, string>;
}

function buildSalaryLoanApplicationRow(opts: {
  referenceNo: string;
  values: Record<string, unknown>;
  labels: Record<string, string>;
}) {
  const timestamp = new Date().toLocaleString("en-PH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Manila",
  });

  const row: Record<string, string> = {
    Timestamp: timestamp,
    "Ref #": opts.referenceNo,
    Email: findValue(opts.values, opts.labels, "email", "emailaddress", "email address"),
    "ID Number": findValue(opts.values, opts.labels, "idnumber", "id number", "employeeid", "employee id"),
    "Last Name": findValue(opts.values, opts.labels, "lastname", "last name"),
    "First Name": findValue(opts.values, opts.labels, "firstname", "first name"),
    "Middle Name": findValue(opts.values, opts.labels, "middlename", "middle name"),
    Department: findValue(opts.values, opts.labels, "department"),
    "Job Designation": findValue(opts.values, opts.labels, "jobdesignation", "job designation", "jobtitle", "job title", "position"),
    Location: findValue(opts.values, opts.labels, "location"),
    "Date of Employment": findValue(opts.values, opts.labels, "dateofemployment", "date of employment", "employmentdate", "employment date"),
    "Months Tenure": findValue(opts.values, opts.labels, "monthstenure", "months tenure", "tenure"),
    "Manager / Supervisor": findValue(
      opts.values,
      opts.labels,
      "manager",
      "supervisor",
      "manager/supervisor",
      "manager / supervisor",
    ),
    Status: "pending",
  };

  return row;
}

async function ensureNoEmployeeInfoDuplicate(row: Record<string, string>) {
  const matrix = await readSpreadsheetMatrix(
    EMPLOYEE_INFORMATION_SPREADSHEET_ID,
    `${EMPLOYEE_INFORMATION_SHEET_NAME}!A1:ZZ5000`,
  );
  if (!matrix.length) return;
  const headers = (matrix[0] ?? []).map((value) => String(value ?? "").trim());
  const idx = (name: string) => headers.findIndex((header) => normalizeKey(header) === normalizeKey(name));
  const employeeIdIndex = idx("Employee ID");
  const emailIndex = Math.max(idx("Email"), idx("Email Address"));
  const firstNameIndex = idx("First Name");

  for (const cells of matrix.slice(1)) {
    if (!cells || cells.every((cell) => !String(cell ?? "").trim())) continue;
    const existingEmployeeId = employeeIdIndex >= 0 ? normalizeCompare(String(cells[employeeIdIndex] ?? "")) : "";
    const existingEmail = emailIndex >= 0 ? normalizeCompare(String(cells[emailIndex] ?? "")) : "";
    const existingFirstName = firstNameIndex >= 0 ? normalizeCompare(String(cells[firstNameIndex] ?? "")) : "";
    const incomingFirstName = normalizeCompare(String(row["First Name"] ?? ""));
    const incomingEmployeeId = normalizeCompare(String(row["Employee ID"] ?? ""));
    const incomingEmail = normalizeCompare(String(row.Email ?? row["Email Address"] ?? ""));

    if (
      (incomingEmployeeId && existingEmployeeId && incomingEmployeeId === existingEmployeeId) ||
      (incomingEmail && existingEmail && incomingEmail === existingEmail) ||
      (incomingFirstName && existingFirstName && incomingFirstName === existingFirstName)
    ) {
      console.warn("employee-info-duplicate-detected", {
        at: new Date().toISOString(),
        employeeId: row["Employee ID"] || "",
        email: row.Email || row["Email Address"] || "",
        firstName: row["First Name"] || "",
      });
      throw new Error(
        "Duplicate/Already exists: this employee information is already on file (First Name, Employee ID, or Email).",
      );
    }
  }
}

async function enforceEmployeeInformationHeaders() {
  const matrix = await readSpreadsheetMatrix(
    EMPLOYEE_INFORMATION_SPREADSHEET_ID,
    `${EMPLOYEE_INFORMATION_SHEET_NAME}!A1:ZZ1`,
  );
  const currentHeaders = (matrix[0] ?? []).map((value) => String(value ?? "").trim());
  const missing = EMPLOYEE_INFORMATION_HEADERS.filter(
    (header) => !currentHeaders.some((existing) => normalizeKey(existing) === normalizeKey(header)),
  );
  if (currentHeaders.length === 0) {
    await writeSpreadsheetRow({
      spreadsheetId: EMPLOYEE_INFORMATION_SPREADSHEET_ID,
      range: `${EMPLOYEE_INFORMATION_SHEET_NAME}!A1`,
      values: [...EMPLOYEE_INFORMATION_HEADERS],
    });
    return;
  }
  if (missing.length === 0) return;
  await writeSpreadsheetRow({
    spreadsheetId: EMPLOYEE_INFORMATION_SPREADSHEET_ID,
    range: `${EMPLOYEE_INFORMATION_SHEET_NAME}!A1`,
    values: [...currentHeaders, ...missing],
  });
}

async function enforceSalaryLoanHeaders() {
  const matrix = await readSpreadsheetMatrix(
    EMPLOYEE_INFORMATION_SPREADSHEET_ID,
    `${SALARY_LOAN_SHEET_NAME}!A1:ZZ1`,
  );
  const currentHeaders = (matrix[0] ?? []).map((value) => String(value ?? "").trim());
  const missing = SALARY_LOAN_HEADERS.filter(
    (header) => !currentHeaders.some((existing) => normalizeKey(existing) === normalizeKey(header)),
  );
  if (currentHeaders.length === 0) {
    await writeSpreadsheetRow({
      spreadsheetId: EMPLOYEE_INFORMATION_SPREADSHEET_ID,
      range: `${SALARY_LOAN_SHEET_NAME}!A1`,
      values: [...SALARY_LOAN_HEADERS],
    });
    return;
  }
  if (missing.length === 0) return;
  await writeSpreadsheetRow({
    spreadsheetId: EMPLOYEE_INFORMATION_SPREADSHEET_ID,
    range: `${SALARY_LOAN_SHEET_NAME}!A1`,
    values: [...currentHeaders, ...missing],
  });
}

function collectFieldValue(field: ImportedFieldDefinition, formData: FormData) {
  if (field.type === "checkbox") {
    return formData.get(field.name) ? "Yes" : "No";
  }

  if (field.type === "checkbox-group") {
    return formData
      .getAll(field.name)
      .map((value) => String(value).trim())
      .filter(Boolean);
  }

  return String(formData.get(field.name) ?? "").trim();
}

function humanize(input: string) {
  return input
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizePayloadValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (value == null) return "";
  return String(value).trim();
}

function parseFramePayload(formData: FormData) {
  const raw = String(formData.get("__payload") ?? "").trim();
  if (!raw) return null;

  const parsed = JSON.parse(raw) as {
    values?: Record<string, unknown>;
    labels?: Record<string, unknown>;
  };
  const values = Object.fromEntries(
    Object.entries(parsed.values ?? {})
      .map(([key, value]) => [key.trim(), normalizePayloadValue(value)])
      .filter(([key]) => key)
  );
  const labels = Object.fromEntries(
    Object.entries(parsed.labels ?? {})
      .map(([key, value]) => [key.trim(), String(value ?? "").replace(/\s+/g, " ").trim()])
      .filter(([key, value]) => key && value)
  );

  return { values, labels };
}

function isMiddleNameField(field: ImportedFieldDefinition) {
  const key = `${field.name} ${field.label}`.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return key.includes("middlename");
}

function isFieldMissing(slug: string, field: ImportedFieldDefinition, value: unknown) {
  if (slug === "employee-information" && isMiddleNameField(field)) return false;
  if (!field.required) return false;
  if (Array.isArray(value)) return value.length === 0;
  if (field.type === "checkbox") return value !== "Yes";
  return !String(value ?? "").trim();
}

function stringifyValue(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  return String(value ?? "");
}

async function writeImportedSubmissionToSheet(opts: {
  spreadsheetId: string;
  sheetTitle: string;
  referenceNo: string;
  slug: string;
  importedName: string;
  submittedByEmail: string;
  submittedByName: string;
  labels: Record<string, string>;
  values: Record<string, unknown>;
}) {
  await appendResponseSheetRow({
    spreadsheetId: opts.spreadsheetId,
    sheetTitle: opts.sheetTitle,
    rowValues: buildResponseSheetRows({
      referenceNo: opts.referenceNo,
      formSlug: opts.slug,
      formName: opts.importedName,
      submittedByEmail: opts.submittedByEmail,
      submittedByName: opts.submittedByName,
      labels: opts.labels,
      values: opts.values,
    }),
  });
}

export async function submitImportedForm(slug: string, formData: FormData) {
  const startedAt = Date.now();
  try {
    const session = await auth();
    const email = session?.user?.email?.toLowerCase();
    const name = session?.user?.name ?? email ?? "";
    if (!email) throw new Error("Not signed in");

    await connectMongo();

    const definition = await getFormDefinitionBySlug(slug);
    if (!definition || definition.source !== "imported") {
      throw new Error("Imported form not found.");
    }

    const isAdmin = await isAdminUser(email);
    const access = getFormUserAccess(definition, { isAdmin });
    if (!access.canSubmit) {
      throw new Error(access.blockerMessage || "This form is not available right now.");
    }

    const imported = await FormImport.findOne({ slug }).lean();
    if (!imported) throw new Error("Import source not found.");

    const runtime = parseImportedFormHtml(imported.htmlSource ?? "");
    if (runtime.fields.length === 0) {
      throw new Error("This imported form does not contain any supported fields yet.");
    }

    const values: Record<string, unknown> = {};
    const labels: Record<string, string> = {};
    const missing: string[] = [];
    const framePayload = parseFramePayload(formData);

    for (const field of runtime.fields) {
      const value = framePayload
        ? normalizePayloadValue(framePayload.values[field.name])
        : collectFieldValue(field, formData);
      values[field.name] = value;
      labels[field.name] = framePayload?.labels[field.name] || field.label;
      if (isFieldMissing(slug, field, value)) missing.push(field.label);
    }

    if (framePayload) {
      for (const [name, value] of Object.entries(framePayload.values)) {
        if (name in values) continue;
        values[name] = value;
        labels[name] = framePayload.labels[name] || humanize(name);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(", ")}`);
    }

    const isEmployeeInformation = slug === EMPLOYEE_INFORMATION_SLUG;
    let employeeRow: Record<string, string> | null = null;
    if (isEmployeeInformation) {
      // Fast-fail duplicate check before heavy writes/sync operations.
      employeeRow = buildEmployeeInformationRow({ referenceNo: "", values, labels });
      const fingerprint = buildEmployeeFingerprint(employeeRow);
      const duplicateInRequests = await RequestModel.exists({
        formType: "imported",
        formSlug: EMPLOYEE_INFORMATION_SLUG,
        "formData.employeeFingerprint": fingerprint,
      });
      if (duplicateInRequests) {
        throw new Error(
          "Duplicate/Already exists: this employee information is already on file (First Name, Employee ID, or Email).",
        );
      }
      await ensureNoEmployeeInfoDuplicate(employeeRow);
    }

    const isSalaryLoan = isSalaryLoanForm(slug, imported.name);
    const referenceNo = isSalaryLoan
      ? await generateSalaryLoanReferenceNo()
      : await generateReferenceNo("imported");

    const history = [
      {
        at: new Date(),
        byEmail: email,
        byName: name,
        action: "submitted",
        details: { importedSlug: slug },
      },
    ];
    const queueFields = deriveRequestQueueFields({
      status: "submitted",
      approvalChain: [],
      currentStep: 0,
      history,
      submittedBy: { email, name },
    });

    const createdRequest = await RequestModel.create({
      formType: "imported",
      formSlug: slug,
      formName: imported.name,
      referenceNo,
      submittedBy: { email, name },
      formData: {
        importedSlug: slug,
        importedFormName: imported.name,
        spreadsheetId: imported.spreadsheetId ?? "",
        employeeFingerprint:
          isEmployeeInformation && employeeRow ? buildEmployeeFingerprint(employeeRow) : undefined,
        fieldLabels: labels,
        values,
      },
      approvalChain: [],
      currentStep: 0,
      status: "submitted",
      history,
      ...queueFields,
    });

    await syncRequestMirror({
      requestId: String(createdRequest._id),
      referenceNo,
      formSlug: slug,
      formName: imported.name,
      submittedBy: { email, name },
      formData: {
        importedSlug: slug,
        importedFormName: imported.name,
        spreadsheetId: imported.spreadsheetId ?? "",
        employeeFingerprint:
          isEmployeeInformation && employeeRow ? buildEmployeeFingerprint(employeeRow) : undefined,
        fieldLabels: labels,
        values,
      },
      approvalChain: [],
      currentStep: 0,
      status: "submitted",
      history: createdRequest.history,
      createdAt: createdRequest.createdAt,
      updatedAt: createdRequest.updatedAt,
    });

    const responseSpreadsheetId = isEmployeeInformation
      ? EMPLOYEE_INFORMATION_SPREADSHEET_ID
      : definition.responseSpreadsheetId?.trim() ||
        imported.spreadsheetId?.trim() ||
        process.env.GOOGLE_SHEETS_RESPONSES_ID?.trim() ||
        process.env.GOOGLE_SHEETS_MASTER_ID?.trim() ||
        "";
    const responseSheetName = isEmployeeInformation
      ? EMPLOYEE_INFORMATION_SHEET_NAME
      : isSalaryLoan
      ? SALARY_LOAN_SHEET_NAME
      : definition.responseSheetName?.trim() ||
        (imported as any).responseSheetName?.trim() ||
        `${imported.name} Responses`;
    const shouldWriteResponses = isEmployeeInformation
      ? true
      : isSalaryLoan
      ? true
      : definition.writeResponsesToSheet || Boolean((imported as any).writeResponsesToSheet);

    if (!responseSpreadsheetId && shouldWriteResponses) {
      throw new Error("Response spreadsheet is not configured for this form.");
    }

    if (shouldWriteResponses) {
      if (isEmployeeInformation) {
        await enforceEmployeeInformationHeaders();
        if (!employeeRow) {
          employeeRow = buildEmployeeInformationRow({ referenceNo, values, labels });
          await ensureNoEmployeeInfoDuplicate(employeeRow);
        }
        await writeImportedSubmissionToSheet({
          spreadsheetId: responseSpreadsheetId,
          sheetTitle: responseSheetName,
          referenceNo,
          slug,
          importedName: imported.name,
          submittedByEmail: email,
          submittedByName: name,
          labels: {},
          values: employeeRow,
        });
      } else if (isSalaryLoan) {
        await enforceSalaryLoanHeaders();
        const salaryLoanRow = buildSalaryLoanApplicationRow({
          referenceNo,
          values,
          labels,
        });
        await writeImportedSubmissionToSheet({
          spreadsheetId: responseSpreadsheetId,
          sheetTitle: responseSheetName,
          referenceNo,
          slug,
          importedName: imported.name,
          submittedByEmail: email,
          submittedByName: name,
          labels: {},
          values: salaryLoanRow,
        });
      } else {
        await writeImportedSubmissionToSheet({
          spreadsheetId: responseSpreadsheetId,
          sheetTitle: responseSheetName,
          referenceNo,
          slug,
          importedName: imported.name,
          submittedByEmail: email,
          submittedByName: name,
          labels,
          values,
        });
      }
    }

    await setFlashToast({
      tone: "success",
      message: `${imported.name} submitted and recorded to ${responseSheetName}: ${referenceNo}`,
    });

    try {
      const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
      const requestUrl = appUrl ? `${appUrl}/requests/${referenceNo}` : "";
      const isEmployeeInformation = slug === EMPLOYEE_INFORMATION_SLUG;
      const hrRecipients = isEmployeeInformation
        ? (
            await Approver.find({
              isActive: true,
              roles: "hr",
              email: { $exists: true, $ne: "" },
            })
              .select({ email: 1 })
              .lean()
          ).map((item) => String(item.email ?? "").trim().toLowerCase()).filter(Boolean)
        : [];
      const emailSubject = isEmployeeInformation
        ? "Employee Information Submission Confirmed"
        : `${imported.name} submitted (${referenceNo})`;
      const submitterText = isEmployeeInformation
        ? `Your Employee Information form has been submitted successfully.\n\n` +
          `Submission details:\n` +
          `- Name: ${employeeRow?.["Last Name"] ?? ""}, ${employeeRow?.["First Name"] ?? ""}\n` +
          `- Email: ${employeeRow?.Email ?? ""}\n` +
          `- Contact No.: ${employeeRow?.["Contact No"] ?? ""}\n` +
          `- Job Title: ${employeeRow?.["Job Title"] ?? ""}\n` +
          `- Reference No: ${referenceNo}\n` +
          (requestUrl ? `- Request Link: ${requestUrl}\n` : "")
        : `Your ${imported.name} form has been submitted successfully.\n\n` +
          `Submission details:\n` +
          `- Reference No: ${referenceNo}\n` +
          (requestUrl ? `- Request Link: ${requestUrl}\n` : "");
      const submitterHtml = isEmployeeInformation
        ? `
          <p>Your Employee Information form has been submitted successfully.</p>
          <p><strong>Submission details:</strong><br />
          Name: ${employeeRow?.["Last Name"] ?? ""}, ${employeeRow?.["First Name"] ?? ""}<br />
          Email: ${employeeRow?.Email ?? ""}<br />
          Contact No.: ${employeeRow?.["Contact No"] ?? ""}<br />
          Job Title: ${employeeRow?.["Job Title"] ?? ""}<br />
          Reference No: ${referenceNo}</p>
          <p style="margin-top:14px;">
            ${requestUrl ? `<a href="${requestUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#1e293b;color:#fff;text-decoration:none;font-weight:600;">Open Request</a>` : ""}
          </p>
        `
        : undefined;
      const notificationJobs: Array<Promise<unknown>> = [];
      notificationJobs.push(
        (async () => {
          const sentSubmitterViaFlow = await sendFlowNotification({
            formSlug: slug,
            formName: imported.name,
            event: "submitted",
            to: [email],
            subject: emailSubject,
            text: submitterText,
            html: submitterHtml,
          });
          if (!sentSubmitterViaFlow && isEmployeeInformation) {
            await sendNotificationEmail({
              to: [email],
              subject: emailSubject,
              text: submitterText,
            });
          }
        })()
      );
      if (isEmployeeInformation && hrRecipients.length > 0) {
        const hrSubject = "HR Notification: Employee Information Submitted";
        const hrText =
          `A new Employee Information form has been submitted and recorded.\n\n` +
          `Submission details:\n` +
          `- Name: ${employeeRow?.["Last Name"] ?? ""}, ${employeeRow?.["First Name"] ?? ""}\n` +
          `- Email: ${employeeRow?.Email ?? ""}\n` +
          `- Contact No.: ${employeeRow?.["Contact No"] ?? ""}\n` +
          `- Job Title: ${employeeRow?.["Job Title"] ?? ""}\n` +
          `- Reference No: ${referenceNo}\n` +
          `- Spreadsheet Link: ${EMPLOYEE_INFORMATION_SHEET_URL}\n` +
          (requestUrl ? `- Request Link: ${requestUrl}\n` : "");
        const hrHtml = `
          <p>A new Employee Information form has been submitted and recorded.</p>
          <p><strong>Submission details:</strong><br />
          Name: ${employeeRow?.["Last Name"] ?? ""}, ${employeeRow?.["First Name"] ?? ""}<br />
          Email: ${employeeRow?.Email ?? ""}<br />
          Contact No.: ${employeeRow?.["Contact No"] ?? ""}<br />
          Job Title: ${employeeRow?.["Job Title"] ?? ""}<br />
          Reference No: ${referenceNo}</p>
          <p style="margin-top:14px;">
            <a href="${EMPLOYEE_INFORMATION_SHEET_URL}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#0f5f35;color:#fff;text-decoration:none;font-weight:600;">Open Spreadsheet</a>
            ${requestUrl ? ` <a href="${requestUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#1e293b;color:#fff;text-decoration:none;font-weight:600;">Open Request</a>` : ""}
          </p>
        `;
        notificationJobs.push(
          sendNotificationEmail({
            to: hrRecipients,
            subject: hrSubject,
            text: hrText,
            html: hrHtml,
          })
        );
      }
      void Promise.allSettled(notificationJobs).then((results) => {
        const rejectedCount = results.filter((result) => result.status === "rejected").length;
        if (rejectedCount > 0) {
          console.error("Imported form async notification failures", {
            slug,
            referenceNo,
            rejectedCount,
          });
        }
      });
      await setFlashToast({
        tone: "success",
        message: `${imported.name} submitted and notifications sent to submitter + HR: ${referenceNo}`,
      });
    } catch (notificationError) {
      console.error("Imported form submit notification failed:", notificationError);
    }

    redirect(`/requests/${referenceNo}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(`submitImportedForm failed for ${slug}:`, error);
    const duplicateEmployeeInfoError =
      slug === EMPLOYEE_INFORMATION_SLUG &&
      error instanceof Error &&
      error.message.toLowerCase().includes("duplicate/already exists");
    await setFlashToast({
      tone: "error",
      message:
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "The imported form could not be submitted.",
      persistent: duplicateEmployeeInfoError,
    });
    if (duplicateEmployeeInfoError) {
      redirect(`/forms/${slug}?submitError=duplicate`);
    }
    redirect(`/forms/${slug}`);
  } finally {
    console.log("submitImportedForm timing", {
      slug,
      elapsedMs: Date.now() - startedAt,
    });
  }
}
