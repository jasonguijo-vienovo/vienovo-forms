"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
import { getFormUserAccess } from "@/lib/forms/runtime-state";
import { fireImportedFormTrigger } from "@/lib/forms/triggers";
import { parseImportedFormHtml, type ImportedFieldDefinition } from "@/lib/imported-forms";
import { sendNotificationEmail } from "@/lib/notifications/email";
import { sendFlowNotification } from "@/lib/notifications/flow";
import { deriveRequestQueueFields } from "@/lib/request-queue";
import { generateReferenceNo } from "@/lib/reference-number";
import { syncRequestMirror } from "@/lib/request-mirror";
import { appendResponseSheetRow, buildResponseSheetRows } from "@/lib/response-sheet";
import { readSpreadsheetMatrix, writeSpreadsheetRow } from "@/lib/google/sheets";
import { buildPendingStepNotificationCopy, isProcessorRole } from "@/lib/workflow-routing";
import {
  buildImportedAttachmentDetails,
  buildNotificationDetailsFromFieldMap,
  importedFieldMap,
} from "@/lib/request-fields";
import { RequestModel } from "@/models/Request";
import { Approver } from "@/models/Approver";
import { FormImport } from "@/models/FormImport";
import { AuditLog } from "@/models/AuditLog";

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
const FIXED_ASSETS_SPREADSHEET_ID = "1-Ml75zLsLUvackWpjnitqcfJwaL1OtBBKyq7PRZ82vM";
const FIXED_ASSETS_SHEET_BY_SLUG: Record<string, string> = {
  "request-for-fixed-asset-item-code": "REQUEST FOR FIXED ASSET ITEM CODE",
  "departments-existing-fixed-asset-inventory": "Existing Asset Inventory",
  "fixed-assets-additions-form": "Fixed Assets Additions",
  "employee-assets-accountability-form": "Employee Accountability",
  "fixed-assets-control-log-form": "Control Log",
};
const FIXED_ASSET_ITEM_CODE_HEADERS = [
  "Timestamp",
  "Reference",
  "Requester Name",
  "Requester Email",
  "CAPEX BUDGET",
  "Item Description",
  "Asset Class",
  "Department",
  "Sub-Department",
  "Location",
  "Project Name",
  "Total Cost",
  "Supporting Document",
  "ASSIGNED ITEM CODE",
  "PO NUMBER",
  "Email Status",
] as const;
const DEPARTMENTAL_INVENTORY_HEADERS = [
  "Timestamp",
  "FILLED-UP / COMPLETED BY",
  "Email",
  "DEPARMENT",
  "Sub-Department",
  "LOCATION",
  "DEPARTMENT HEAD",
  "ITEM DESCRIPTION",
  "QNTY",
  "YEAR PURCHASED/DELIVERED",
  "CUSTODIAN",
  "Ref",
] as const;
const FIXED_ASSET_ADDITIONS_HEADERS = [
  "Timestamp",
  "Submitted By",
  "Email",
  "PO #",
  "Supplier",
  "Invoice Date",
  "Delivery Date",
  "CAPEX Budget Ref#",
  "Asset Type",
  "Asset Item Code",
  "Asset Description",
  "Qnty",
  "Price",
  "Total Cost",
  "Useful Life",
  "Department",
  "Sub-Department",
  "Location",
  "Asset Assignee",
  "Assignee Email",
  "Component Asset Tag",
  "Attachment URL",
  "Ack Token",
  "RefID",
  "Status",
] as const;
const EMPLOYEE_ASSET_ACCOUNTABILITY_HEADERS = [
  "Timestamp",
  "ID Number",
  "Employee",
  "Employee Email",
  "Department",
  "Location",
  "Department Head",
  "Department Head Email",
  "Hardware Type",
  "Brand",
  "Model",
  "Computer Serial Number",
  "Computer Name",
  "Processor",
  "Storage",
  "RAM",
  "OS",
  "License Key",
  "Peripheral Type",
  "Peripheral Description",
  "Peripheral Brand/Model",
  "Peripheral Quantity",
  "Peripheral Serial Number",
  "Peripheral Condition",
  "RefID",
  "Manager Status",
  "Manager Timestamp",
  "Manager Remarks",
  "Processor Status,",
  "Processor Timestamp",
  "Remarks",
  "Employee Ack Status",
  "Employee Ack Timestamp",
  "Dept Ack Status",
  "Dept Ack Timestamp",
  "Processor Status",
  "Timestamp",
] as const;
const FIXED_ASSET_CHANGE_CONTROL_LOG_HEADERS = [
  "Timestamp",
  "RefID",
  "Date of Change",
  "Asset Tag / Asset No.",
  "Asset Description",
  "Type of Change",
  "Old Value / Details",
  "New Value / Details",
  "Old Assignee",
  "Reason for Change",
  "Old Assignee Email",
  "New Assignee",
  "New Assignee Email",
  "Requested By",
  "Request by Email",
  "Approved By",
  "Approver Email",
  "Supporting Documents",
  "Status",
  "Assignee Ack Timestamp",
  "Approval Timestamp",
  "Processed Timestamp",
  "Processor Email",
  "Assignee Token",
  "Approve Token",
  "Process Token",
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

function resolveFixedAssetsSheet(slug: string) {
  return FIXED_ASSETS_SHEET_BY_SLUG[String(slug || "").trim().toLowerCase()] ?? "";
}

function isFixedAssetsImportedForm(slug: string) {
  return Boolean(resolveFixedAssetsSheet(slug));
}

function buildFixedAssetItemCodeRow(opts: {
  referenceNo: string;
  submittedByName: string;
  submittedByEmail: string;
  values: Record<string, unknown>;
  labels: Record<string, string>;
}) {
  const now = new Date();
  const timestamp = now.toLocaleString("en-PH", {
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
    Reference: opts.referenceNo,
    "Requester Name": opts.submittedByName,
    "Requester Email": opts.submittedByEmail,
    "CAPEX BUDGET": findValue(opts.values, opts.labels, "capexbudget", "capex budget"),
    "Item Description": findValue(opts.values, opts.labels, "description", "itemdescription", "item description"),
    "Asset Class": findValue(opts.values, opts.labels, "assetclass", "asset class", "assetcategory", "asset category"),
    Department: findValue(opts.values, opts.labels, "department"),
    "Sub-Department": findValue(opts.values, opts.labels, "subdepartment", "sub-department"),
    Location: findValue(opts.values, opts.labels, "location"),
    "Project Name": findValue(opts.values, opts.labels, "projectname", "project name"),
    "Total Cost": findValue(opts.values, opts.labels, "totalcost", "total cost", "approvedannualbudget", "approved annual budget"),
    "Supporting Document": findAttachmentLink(opts.values, opts.labels),
    "ASSIGNED ITEM CODE": findValue(opts.values, opts.labels, "assigneditemcode", "assigned item code"),
    "PO NUMBER": findValue(opts.values, opts.labels, "ponumber", "po number"),
    "Email Status": findValue(opts.values, opts.labels, "emailstatus", "email status"),
  };

  for (const header of FIXED_ASSET_ITEM_CODE_HEADERS) {
    if (!(header in row)) row[header] = "";
  }
  return row;
}

function buildDepartmentalInventoryRow(opts: {
  referenceNo: string;
  submittedByName: string;
  submittedByEmail: string;
  values: Record<string, unknown>;
  labels: Record<string, string>;
}) {
  const now = new Date();
  const timestamp = now.toLocaleString("en-PH", {
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
    "FILLED-UP / COMPLETED BY": findValue(opts.values, opts.labels, "preparedby", "prepared by") || opts.submittedByName,
    Email: findValue(opts.values, opts.labels, "email", "emailaddress", "email address") || opts.submittedByEmail,
    DEPARMENT: findValue(opts.values, opts.labels, "department"),
    "Sub-Department": findValue(opts.values, opts.labels, "subdepartment", "sub-department"),
    LOCATION: findValue(opts.values, opts.labels, "location"),
    "DEPARTMENT HEAD": findValue(opts.values, opts.labels, "departmenthead", "department head"),
    "ITEM DESCRIPTION": findValue(opts.values, opts.labels, "assetdescription", "asset description", "itemdescription", "item description"),
    QNTY: findValue(opts.values, opts.labels, "quantity", "qnty"),
    "YEAR PURCHASED/DELIVERED": findValue(
      opts.values,
      opts.labels,
      "yearpurchaseddelivered",
      "year purchased/delivered",
      "dateacquired",
      "date acquired",
    ),
    CUSTODIAN: findValue(opts.values, opts.labels, "custodian", "assignedpersonnel", "assigned personnel"),
    Ref: opts.referenceNo,
  };

  for (const header of DEPARTMENTAL_INVENTORY_HEADERS) {
    if (!(header in row)) row[header] = "";
  }
  return row;
}

function buildFixedAssetAdditionsRow(opts: {
  referenceNo: string;
  submittedByName: string;
  submittedByEmail: string;
  values: Record<string, unknown>;
  labels: Record<string, string>;
}) {
  const now = new Date();
  const timestamp = now.toLocaleString("en-PH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Manila",
  });

  const price = findValue(opts.values, opts.labels, "purchaseprice", "purchase price", "price");
  const quantity = findValue(opts.values, opts.labels, "quantity", "qnty");
  const totalCost = findValue(opts.values, opts.labels, "totalcost", "total cost") || (() => {
    const p = Number(price);
    const q = Number(quantity || "1");
    if (!Number.isFinite(p)) return "";
    return String(p * (Number.isFinite(q) ? q : 1));
  })();

  const row: Record<string, string> = {
    Timestamp: timestamp,
    "Submitted By": opts.submittedByName,
    Email: opts.submittedByEmail,
    "PO #": findValue(opts.values, opts.labels, "ponumber", "po #", "po number"),
    Supplier: findValue(opts.values, opts.labels, "supplier"),
    "Invoice Date": findValue(opts.values, opts.labels, "invoicedate", "invoice date"),
    "Delivery Date": findValue(opts.values, opts.labels, "deliverydate", "delivery date"),
    "CAPEX Budget Ref#": findValue(opts.values, opts.labels, "capexbudgetref", "capex budget ref#"),
    "Asset Type": findValue(opts.values, opts.labels, "assettype", "asset type", "assetcategory", "asset category"),
    "Asset Item Code": findValue(opts.values, opts.labels, "assetitemcode", "asset item code", "assetcode", "asset code"),
    "Asset Description": findValue(opts.values, opts.labels, "assetdescription", "asset description"),
    Qnty: quantity,
    Price: price,
    "Total Cost": totalCost,
    "Useful Life": findValue(opts.values, opts.labels, "usefullife", "useful life", "useful life (years)"),
    Department: findValue(opts.values, opts.labels, "department"),
    "Sub-Department": findValue(opts.values, opts.labels, "subdepartment", "sub-department"),
    Location: findValue(opts.values, opts.labels, "location"),
    "Asset Assignee": findValue(opts.values, opts.labels, "assetassignee", "asset assignee", "receivedby", "received by"),
    "Assignee Email": findValue(opts.values, opts.labels, "assigneeemail", "assignee email"),
    "Component Asset Tag": findValue(opts.values, opts.labels, "componentassettag", "component asset tag"),
    "Attachment URL": findAttachmentLink(opts.values, opts.labels),
    "Ack Token": findValue(opts.values, opts.labels, "acktoken", "ack token"),
    RefID: opts.referenceNo,
    Status: "submitted",
  };

  for (const header of FIXED_ASSET_ADDITIONS_HEADERS) {
    if (!(header in row)) row[header] = "";
  }
  return row;
}

function buildEmployeeAssetAccountabilityRow(opts: {
  referenceNo: string;
  submittedByName: string;
  submittedByEmail: string;
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
    "ID Number": findValue(opts.values, opts.labels, "idnumber", "id number", "employeeid", "employee id"),
    Employee: findValue(opts.values, opts.labels, "employeename", "employee name") || opts.submittedByName,
    "Employee Email": findValue(opts.values, opts.labels, "employeeemail", "employee email", "email") || opts.submittedByEmail,
    Department: findValue(opts.values, opts.labels, "department"),
    Location: findValue(opts.values, opts.labels, "location"),
    "Department Head": findValue(opts.values, opts.labels, "departmenthead", "department head"),
    "Department Head Email": findValue(opts.values, opts.labels, "departmentheademail", "department head email"),
    "Hardware Type": findValue(opts.values, opts.labels, "hardwaretype", "hardware type"),
    Brand: findValue(opts.values, opts.labels, "brand"),
    Model: findValue(opts.values, opts.labels, "model"),
    "Computer Serial Number": findValue(opts.values, opts.labels, "computerserialnumber", "computer serial number", "serialnumber", "serial number"),
    "Computer Name": findValue(opts.values, opts.labels, "computername", "computer name"),
    Processor: findValue(opts.values, opts.labels, "processor"),
    Storage: findValue(opts.values, opts.labels, "storage"),
    RAM: findValue(opts.values, opts.labels, "ram"),
    OS: findValue(opts.values, opts.labels, "os"),
    "License Key": findValue(opts.values, opts.labels, "licensekey", "license key"),
    "Peripheral Type": findValue(opts.values, opts.labels, "peripheraltype", "peripheral type"),
    "Peripheral Description": findValue(opts.values, opts.labels, "peripheraldescription", "peripheral description"),
    "Peripheral Brand/Model": findValue(opts.values, opts.labels, "peripheralbrandmodel", "peripheral brand/model"),
    "Peripheral Quantity": findValue(opts.values, opts.labels, "peripheralquantity", "peripheral quantity", "quantity", "qnty"),
    "Peripheral Serial Number": findValue(opts.values, opts.labels, "peripheralserialnumber", "peripheral serial number"),
    "Peripheral Condition": findValue(opts.values, opts.labels, "peripheralcondition", "peripheral condition", "condition"),
    RefID: opts.referenceNo,
    "Manager Status": findValue(opts.values, opts.labels, "managerstatus", "manager status") || "pending",
    "Manager Timestamp": findValue(opts.values, opts.labels, "managertimestamp", "manager timestamp"),
    "Manager Remarks": findValue(opts.values, opts.labels, "managerremarks", "manager remarks"),
    "Processor Status,": findValue(opts.values, opts.labels, "processorstatus", "processor status"),
    "Processor Timestamp": findValue(opts.values, opts.labels, "processortimestamp", "processor timestamp"),
    Remarks: findValue(opts.values, opts.labels, "remarks"),
    "Employee Ack Status": findValue(opts.values, opts.labels, "employeeackstatus", "employee ack status"),
    "Employee Ack Timestamp": findValue(opts.values, opts.labels, "employeeacktimestamp", "employee ack timestamp"),
    "Dept Ack Status": findValue(opts.values, opts.labels, "deptackstatus", "dept ack status"),
    "Dept Ack Timestamp": findValue(opts.values, opts.labels, "deptacktimestamp", "dept ack timestamp"),
    "Processor Status": findValue(opts.values, opts.labels, "processorstatus", "processor status"),
  };

  for (const header of EMPLOYEE_ASSET_ACCOUNTABILITY_HEADERS) {
    if (!(header in row)) row[header] = "";
  }
  return row;
}

function buildFixedAssetChangeControlLogRow(opts: {
  referenceNo: string;
  submittedByName: string;
  submittedByEmail: string;
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
    RefID: opts.referenceNo,
    "Date of Change": findValue(opts.values, opts.labels, "dateofchange", "date of change", "date"),
    "Asset Tag / Asset No.": findValue(opts.values, opts.labels, "assettagassetno", "asset tag / asset no.", "assetcode", "asset code"),
    "Asset Description": findValue(opts.values, opts.labels, "assetdescription", "asset description"),
    "Type of Change": findValue(opts.values, opts.labels, "typeofchange", "type of change", "transactiontype", "transaction type"),
    "Old Value / Details": findValue(opts.values, opts.labels, "oldvaluedetails", "old value / details", "fromlocation", "from location"),
    "New Value / Details": findValue(opts.values, opts.labels, "newvaluedetails", "new value / details", "tolocation", "to location"),
    "Old Assignee": findValue(opts.values, opts.labels, "oldassignee", "old assignee"),
    "Reason for Change": findValue(opts.values, opts.labels, "reasonforchange", "reason for change", "reason"),
    "Old Assignee Email": findValue(opts.values, opts.labels, "oldassigneeemail", "old assignee email"),
    "New Assignee": findValue(opts.values, opts.labels, "newassignee", "new assignee", "receivedby", "received by"),
    "New Assignee Email": findValue(opts.values, opts.labels, "newassigneeemail", "new assignee email"),
    "Requested By": findValue(opts.values, opts.labels, "requestedby", "requested by") || opts.submittedByName,
    "Request by Email": findValue(opts.values, opts.labels, "requestbyemail", "request by email", "email") || opts.submittedByEmail,
    "Approved By": findValue(opts.values, opts.labels, "approvedby", "approved by", "authorizedby", "authorized by"),
    "Approver Email": findValue(opts.values, opts.labels, "approveremail", "approver email"),
    "Supporting Documents": findAttachmentLink(opts.values, opts.labels),
    Status: findValue(opts.values, opts.labels, "status") || "submitted",
    "Assignee Ack Timestamp": findValue(opts.values, opts.labels, "assigneeacktimestamp", "assignee ack timestamp"),
    "Approval Timestamp": findValue(opts.values, opts.labels, "approvaltimestamp", "approval timestamp"),
    "Processed Timestamp": findValue(opts.values, opts.labels, "processedtimestamp", "processed timestamp"),
    "Processor Email": findValue(opts.values, opts.labels, "processoremail", "processor email"),
    "Assignee Token": findValue(opts.values, opts.labels, "assigneetoken", "assignee token"),
    "Approve Token": findValue(opts.values, opts.labels, "approvetoken", "approve token"),
    "Process Token": findValue(opts.values, opts.labels, "processtoken", "process token"),
  };

  for (const header of FIXED_ASSET_CHANGE_CONTROL_LOG_HEADERS) {
    if (!(header in row)) row[header] = "";
  }
  return row;
}

async function enforceFixedAssetDuplicateGuard(slug: string, values: Record<string, unknown>, labels: Record<string, string>) {
  const keyedSlugs = new Set([
    "departments-existing-fixed-asset-inventory",
    "fixed-assets-additions-form",
    "fixed-assets-control-log-form",
  ]);
  if (!keyedSlugs.has(slug)) return;

  const assetCode = findValue(values, labels, "assetcode", "asset code").toLowerCase();
  const dateValue = findValue(
    values,
    labels,
    "date",
    "dateofinventory",
    "dateofrequest",
    "purchasedate",
    "dateissued",
    "datecompleted",
  );
  if (!assetCode || !dateValue) return;

  const duplicate = await RequestModel.exists({
    formSlug: slug,
    "formData.values.assetCode": { $regex: `^${assetCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    $or: [
      { "formData.values.date": dateValue },
      { "formData.values.dateOfInventory": dateValue },
      { "formData.values.purchaseDate": dateValue },
      { "formData.values.dateIssued": dateValue },
      { "formData.values.dateCompleted": dateValue },
    ],
  });
  if (duplicate) {
    throw new Error("Possible duplicate submission detected for this asset code and date.");
  }
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

function compactName(input: string) {
  return normalizeCompare(input).replace(/[^a-z0-9]+/g, "");
}

function buildEmployeeFingerprint(row: Record<string, string>) {
  const employeeId = normalizeCompare(String(row["Employee ID"] ?? ""));
  const email = normalizeCompare(String(row.Email ?? row["Email Address"] ?? ""));
  const firstName = normalizeCompare(String(row["First Name"] ?? ""));
  return `${employeeId}|${email}|${firstName}`;
}

function findValue(values: Record<string, unknown>, labels: Record<string, string>, ...aliases: string[]) {
  const wanted = aliases.map(normalizeKey);
  for (const alias of wanted) {
    for (const [key, value] of Object.entries(values)) {
      const byKey = normalizeKey(key);
      const byLabel = normalizeKey(labels[key] || "");
      if (alias === byKey || alias === byLabel) return String(value ?? "").trim();
    }
  }
  return "";
}

function findAttachmentLink(values: Record<string, unknown>, labels: Record<string, string>) {
  return findValue(
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
    "supportingdocuments",
    "supporting documents",
  );
}

function buildImportedApprovalDetailRows(values: Record<string, unknown>, labels: Record<string, string>) {
  const immediateSuperior = findValue(
    values,
    labels,
    "immediatesuperior",
    "immediate superior",
    "manager",
    "supervisor",
    "manager/supervisor",
    "manager / supervisor",
  );
  const departmentHead = findValue(
    values,
    labels,
    "departmenthead",
    "department head",
    "depthead",
    "dept head",
    "head",
  );
  return [
    { label: "Immediate Superior", value: immediateSuperior },
    { label: "Department Head", value: departmentHead },
  ].filter((detail) => detail.value);
}

function enforceRequestForPaymentConditionalFields(
  slug: string,
  values: Record<string, unknown>,
  labels: Record<string, string>,
) {
  if (slug !== "request-for-payment") return;

  const transactionType = findValue(values, labels, "transactionType", "transaction type");
  const typeOfExpense = findValue(values, labels, "typeOfExpense", "type of expense", "type of expenses");
  const natureOfCapex = findValue(values, labels, "natureOfCapex", "nature of capex");
  const natureOfServices = findValue(
    values,
    labels,
    "natureOfServices",
    "nature of services",
    "gl account nature of services",
    "gl account - nature of services",
  );

  if (transactionType === "Operating Expense" && !typeOfExpense) {
    throw new Error("Type of Expense is required for Operating Expense.");
  }
  if (transactionType === "CAPEX" && !natureOfCapex) {
    throw new Error("Nature of CAPEX is required for CAPEX.");
  }
  if (transactionType === "Others" && !natureOfServices) {
    throw new Error("GL Account - Nature of Services is required for Others.");
  }
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

function normalizeEmailValue(value: string) {
  return value.trim().toLowerCase();
}

function normalizeDateValue(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString().slice(0, 10);
}

function normalizeNumericValue(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? String(parsed) : raw;
}

function normalizePayloadValues(values: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const text = String(value ?? "");
    const nk = normalizeKey(key);
    if (nk.includes("email")) normalized[key] = normalizeEmailValue(text);
    else if (nk.includes("date") || nk.includes("timestamp")) normalized[key] = normalizeDateValue(text);
    else if (nk.includes("cost") || nk.includes("price") || nk.includes("qty") || nk.includes("quantity")) {
      normalized[key] = normalizeNumericValue(text);
    } else normalized[key] = text.trim();
  }
  return normalized;
}

function expectedHeadersBySlug(slug: string): readonly string[] | null {
  if (slug === "request-for-fixed-asset-item-code") return FIXED_ASSET_ITEM_CODE_HEADERS;
  if (slug === "departments-existing-fixed-asset-inventory") return DEPARTMENTAL_INVENTORY_HEADERS;
  if (slug === "fixed-assets-additions-form") return FIXED_ASSET_ADDITIONS_HEADERS;
  if (slug === "employee-assets-accountability-form") return EMPLOYEE_ASSET_ACCOUNTABILITY_HEADERS;
  if (slug === "fixed-assets-control-log-form") return FIXED_ASSET_CHANGE_CONTROL_LOG_HEADERS;
  return null;
}

async function ensureSheetHeaders(spreadsheetId: string, sheetTitle: string, expectedHeaders: readonly string[]) {
  const headerRow = (await readSpreadsheetMatrix(spreadsheetId, `${sheetTitle}!A1:ZZ1`))[0] ?? [];
  const existing = headerRow.map((h) => String(h ?? "").trim());
  const missing = expectedHeaders.filter((h) => !existing.includes(h));
  if (missing.length > 0) {
    throw new Error(`Sheet header mismatch on "${sheetTitle}". Missing columns: ${missing.join(", ")}`);
  }
}

async function logSheetWriteAudit(input: {
  actorEmail: string;
  correlationId: string;
  slug: string;
  sheetTitle: string;
  spreadsheetId: string;
  outcome: "success" | "failed";
  details: Record<string, unknown>;
}) {
  await AuditLog.create({
    actorEmail: input.actorEmail || "system@local",
    action: "sheet-write",
    targetType: "imported-form-submission",
    targetId: input.slug,
    correlationId: input.correlationId,
    outcome: input.outcome,
    context: {
      sheetTitle: input.sheetTitle,
      spreadsheetId: input.spreadsheetId,
      mappingVersion: "fixed-assets-v3",
    },
    details: input.details,
  });
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
  const expectedHeaders = expectedHeadersBySlug(opts.slug);
  if (expectedHeaders) {
    await ensureSheetHeaders(opts.spreadsheetId, opts.sheetTitle, expectedHeaders);
  }
  const rowValues = buildResponseSheetRows({
    referenceNo: opts.referenceNo,
    formSlug: opts.slug,
    formName: opts.importedName,
    submittedByEmail: opts.submittedByEmail,
    submittedByName: opts.submittedByName,
    labels: opts.labels,
    values: opts.values,
  });
  try {
    await appendResponseSheetRow({
      spreadsheetId: opts.spreadsheetId,
      sheetTitle: opts.sheetTitle,
      rowValues,
    });
    const verifyRows = await readSpreadsheetMatrix(opts.spreadsheetId, `${opts.sheetTitle}!A1:ZZ5000`);
    const headers = (verifyRows[0] ?? []).map((v) => String(v ?? "").trim());
    const last = verifyRows[verifyRows.length - 1] ?? [];
    const refIndex = headers.findIndex((h) => ["Reference", "Ref", "RefID", "Ref #"].includes(h));
    if (refIndex >= 0 && String(last[refIndex] ?? "").trim() !== opts.referenceNo) {
      throw new Error(`Post-write verification failed for ${opts.sheetTitle}: reference mismatch.`);
    }
    await logSheetWriteAudit({
      actorEmail: opts.submittedByEmail,
      correlationId: opts.referenceNo,
      slug: opts.slug,
      sheetTitle: opts.sheetTitle,
      spreadsheetId: opts.spreadsheetId,
      outcome: "success",
      details: { verified: true },
    });
  } catch (error) {
    await logSheetWriteAudit({
      actorEmail: opts.submittedByEmail,
      correlationId: opts.referenceNo,
      slug: opts.slug,
      sheetTitle: opts.sheetTitle,
      spreadsheetId: opts.spreadsheetId,
      outcome: "failed",
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
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

    const imported = definition.importSourceId
      ? await FormImport.findById(definition.importSourceId).lean()
      : await FormImport.findOne({ slug }).lean();
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
    Object.assign(values, normalizePayloadValues(values));
    enforceRequestForPaymentConditionalFields(slug, values, labels);
    await enforceFixedAssetDuplicateGuard(slug, values, labels);

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
    const requiresApproval = !isEmployeeInformation && !isFixedAssetsImportedForm(slug);
    const selectedApproverRaw = requiresApproval
      ? findValue(
          values,
          labels,
          "manager",
          "supervisor",
          "manager/supervisor",
          "manager / supervisor",
          "approver",
          "slaapprover",
          "sla approver",
          "head",
          "processor",
        )
      : "";
    const selectedApprover = requiresApproval
      ? (() => {
          const selectedRaw = String(selectedApproverRaw || "").trim();
          const selectedEmail = selectedRaw.toLowerCase();
          const selectedNameCompact = compactName(selectedRaw);
          return Approver.findOne({
            isActive: true,
            email: { $exists: true, $ne: "" },
            ...(isSalaryLoan ? { roles: "sla" } : {}),
            $or: [{ email: selectedEmail }, { name: selectedRaw }],
          })
            .select({ _id: 1, name: 1, email: 1, roles: 1 })
            .lean()
            .then(async (exact) => {
              if (exact) return exact;
              // Fallback tolerant match only when exact lookup misses.
              const rows = await Approver.find({
                isActive: true,
                email: { $exists: true, $ne: "" },
                ...(isSalaryLoan ? { roles: "sla" } : {}),
              })
                .select({ _id: 1, name: 1, email: 1, roles: 1 })
                .lean();
              const exactName = rows.find((row) => compactName(String(row.name || "")) === selectedNameCompact);
              return exactName ?? null;
            });
        })()
      : null;
    const resolvedSelectedApprover = selectedApprover ? await selectedApprover : null;
    if (requiresApproval && !resolvedSelectedApprover) {
      throw new Error("No valid selected approver found. Please select a valid approver name or email in the form.");
    }
    const referenceNo = isSalaryLoan
      ? await generateSalaryLoanReferenceNo()
      : await generateReferenceNo("imported");
    const importedApprovalChain = requiresApproval
      ? [
          {
            step: 1,
            role: isSalaryLoan ? "sla" : String(resolvedSelectedApprover?.roles?.[0] || "approver"),
            approverEmail: String(resolvedSelectedApprover?.email ?? "").trim().toLowerCase(),
            approverName: String(resolvedSelectedApprover?.name ?? "").trim(),
            status: "pending",
          },
        ]
      : [];
    const importedStatus = importedApprovalChain.length > 0 ? "pending" : "submitted";

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
      status: importedStatus,
      approvalChain: importedApprovalChain,
      currentStep: importedApprovalChain.length > 0 ? 1 : 0,
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
        selectedApproverId: resolvedSelectedApprover ? String((resolvedSelectedApprover as any)._id ?? "") : "",
        selectedApproverName: String(resolvedSelectedApprover?.name ?? "").trim(),
        selectedApproverEmail: String(resolvedSelectedApprover?.email ?? "").trim().toLowerCase(),
        employeeFingerprint:
          isEmployeeInformation && employeeRow ? buildEmployeeFingerprint(employeeRow) : undefined,
        fieldLabels: labels,
        values,
      },
      approvalChain: importedApprovalChain,
      currentStep: importedApprovalChain.length > 0 ? 1 : 0,
      status: importedStatus,
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
        selectedApproverId: resolvedSelectedApprover ? String((resolvedSelectedApprover as any)._id ?? "") : "",
        selectedApproverName: String(resolvedSelectedApprover?.name ?? "").trim(),
        selectedApproverEmail: String(resolvedSelectedApprover?.email ?? "").trim().toLowerCase(),
        employeeFingerprint:
          isEmployeeInformation && employeeRow ? buildEmployeeFingerprint(employeeRow) : undefined,
        fieldLabels: labels,
        values,
      },
      approvalChain: importedApprovalChain,
      currentStep: importedApprovalChain.length > 0 ? 1 : 0,
      status: importedStatus,
      history: createdRequest.history,
      createdAt: createdRequest.createdAt,
      updatedAt: createdRequest.updatedAt,
    });

    const fixedAssetsSheetName = resolveFixedAssetsSheet(slug);
    const isFixedAssetsForm = Boolean(fixedAssetsSheetName);
    const responseSpreadsheetId = isEmployeeInformation
      ? EMPLOYEE_INFORMATION_SPREADSHEET_ID
      : isFixedAssetsForm
      ? FIXED_ASSETS_SPREADSHEET_ID
      : definition.responseSpreadsheetId?.trim() ||
        imported.spreadsheetId?.trim() ||
        process.env.GOOGLE_SHEETS_RESPONSES_ID?.trim() ||
        process.env.GOOGLE_SHEETS_MASTER_ID?.trim() ||
        "";
    const responseSheetName = isEmployeeInformation
      ? EMPLOYEE_INFORMATION_SHEET_NAME
      : isFixedAssetsForm
      ? fixedAssetsSheetName
      : isSalaryLoan
      ? SALARY_LOAN_SHEET_NAME
      : definition.responseSheetName?.trim() ||
        (imported as any).responseSheetName?.trim() ||
        `${imported.name} Responses`;
    const shouldWriteResponses = isEmployeeInformation
      ? true
      : isFixedAssetsForm
      ? true
      : isSalaryLoan
      ? true
      : definition.writeResponsesToSheet || Boolean((imported as any).writeResponsesToSheet);

    await RequestModel.updateOne(
      { _id: createdRequest._id },
      {
        $set: {
          responseSpreadsheetId: String(responseSpreadsheetId || "").trim(),
          responseSheetName: String(responseSheetName || "").trim(),
          sheetStatusSyncError: "",
        },
      },
    );

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
      } else if (slug === "request-for-fixed-asset-item-code") {
        const row = buildFixedAssetItemCodeRow({
          referenceNo,
          submittedByName: name || "",
          submittedByEmail: email || "",
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
          values: row,
        });
      } else if (slug === "departments-existing-fixed-asset-inventory") {
        const row = buildDepartmentalInventoryRow({
          referenceNo,
          submittedByName: name || "",
          submittedByEmail: email || "",
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
          values: row,
        });
      } else if (slug === "fixed-assets-additions-form") {
        const row = buildFixedAssetAdditionsRow({
          referenceNo,
          submittedByName: name || "",
          submittedByEmail: email || "",
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
          values: row,
        });
      } else if (slug === "employee-assets-accountability-form") {
        const row = buildEmployeeAssetAccountabilityRow({
          referenceNo,
          submittedByName: name || "",
          submittedByEmail: email || "",
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
          values: row,
        });
      } else if (slug === "fixed-assets-control-log-form") {
        const row = buildFixedAssetChangeControlLogRow({
          referenceNo,
          submittedByName: name || "",
          submittedByEmail: email || "",
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
          values: row,
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

    let triggerMessageSuffix = "";
    const triggerResult = await fireImportedFormTrigger({
      form: {
        slug: definition.slug,
        name: definition.name,
        triggerEnabled: definition.triggerEnabled,
        triggerUrl: definition.triggerUrl,
        triggerSource: definition.triggerSource,
        triggerEvent: definition.triggerEvent,
        triggerFunctionName: definition.triggerFunctionName,
      },
      request: {
        id: String(createdRequest._id),
        referenceNo,
      },
      submittedBy: {
        email,
        name,
      },
      values,
      labels,
    });
    if (triggerResult.attempted && !triggerResult.ok) {
      triggerMessageSuffix = ` Trigger follow-up failed: ${triggerResult.error}`;
      console.error("Imported form trigger failed", {
        slug,
        referenceNo,
        error: triggerResult.error,
      });
    }

    await setFlashToast({
      tone: "success",
      message: `${imported.name} submitted and recorded to ${responseSheetName}: ${referenceNo}.${triggerMessageSuffix}`,
    });

    try {
      const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
      const requestUrl = appUrl ? `${appUrl}/requests/${encodeURIComponent(referenceNo)}` : "";
      const approvalPageUrl = requestUrl ? `${requestUrl}/approve` : "";
      const approvalsUrl = appUrl ? `${appUrl}/approvals` : "";
      const isEmployeeInformation = slug === EMPLOYEE_INFORMATION_SLUG;
      const isSalaryLoan = isSalaryLoanForm(slug, imported.name);
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
          `- Attachment: None\n` +
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
          Reference No: ${referenceNo}<br />
          Attachment: None</p>
          <p style="margin-top:14px;">
            ${requestUrl ? `<a href="${requestUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#1e293b;color:#fff;text-decoration:none;font-weight:600;">Open Request</a>` : ""}
          </p>
        `
        : undefined;
      const importedNotificationDetails = buildNotificationDetailsFromFieldMap(importedFieldMap({ fieldLabels: labels, values }), {
        maxRows: 12,
      });
      const attachmentDetails = buildImportedAttachmentDetails({ fieldLabels: labels, values });
      const approvalContactDetails = buildImportedApprovalDetailRows(values, labels);
      const notificationJobs: Array<Promise<unknown>> = [];
      notificationJobs.push(
        (async () => {
          const sentSubmitterViaFlow = await sendFlowNotification({
            formSlug: slug,
            formName: imported.name,
            event: "submitted",
            to: [email],
            primaryRecipientRole: "requester",
            subject: emailSubject,
            text: submitterText,
            html: submitterHtml,
            summary: isEmployeeInformation ? undefined : `Your ${imported.name} form has been submitted successfully.`,
            details: isEmployeeInformation
                ? undefined
                : [
                    { label: "Reference No.", value: referenceNo },
                    { label: "Requester", value: name || email },
                    ...approvalContactDetails,
                    ...importedNotificationDetails,
                    ...attachmentDetails,
                  ],
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
          `- Attachment: None\n` +
          `- Spreadsheet Link: ${EMPLOYEE_INFORMATION_SHEET_URL}\n` +
          (requestUrl ? `- Request Link: ${requestUrl}\n` : "");
        const hrHtml = `
          <p>A new Employee Information form has been submitted and recorded.</p>
          <p><strong>Submission details:</strong><br />
          Name: ${employeeRow?.["Last Name"] ?? ""}, ${employeeRow?.["First Name"] ?? ""}<br />
          Email: ${employeeRow?.Email ?? ""}<br />
          Contact No.: ${employeeRow?.["Contact No"] ?? ""}<br />
          Job Title: ${employeeRow?.["Job Title"] ?? ""}<br />
          Reference No: ${referenceNo}<br />
          Attachment: None</p>
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
      if (requiresApproval) {
        const firstSlaApprover = importedApprovalChain.find((step) => step.step === 1) ?? null;
        const approverRecipients = firstSlaApprover?.approverEmail ? [firstSlaApprover.approverEmail] : [];

        if (approverRecipients.length > 0) {
          const detailsName = isSalaryLoan
            ? `${findValue(values, labels, "lastname", "last name")}, ${findValue(values, labels, "firstname", "first name")} ${findValue(values, labels, "middlename", "middle name")}`.trim()
            : (name || email);
          const detailsEmail = findValue(values, labels, "email", "emailaddress", "email address") || email;
          const currentRole = String(firstSlaApprover?.role || "").trim();
          const processorStep = isProcessorRole(currentRole);
          const nextStepCopy = buildPendingStepNotificationCopy({
            formName: imported.name,
            referenceNo,
            role: currentRole,
          });
          const approverText =
            `A new ${imported.name} request was submitted and ${processorStep ? "is ready for processing" : "requires approval"}.\n\n` +
            `Request details:\n` +
            `- Reference No: ${referenceNo}\n` +
            `- Requester: ${detailsName}\n` +
            `- Email: ${detailsEmail}\n` +
            `- Status: ${processorStep ? "pending processing" : "pending approval"}\n`;

          notificationJobs.push(
            sendFlowNotification({
              formSlug: slug,
              formName: imported.name,
              event: "next-approver",
              to: approverRecipients,
              primaryRecipientRole: currentRole,
              subject: nextStepCopy.subject,
              summary: nextStepCopy.summary,
              details: [
                { label: "Reference No.", value: referenceNo },
                { label: "Requester", value: detailsName },
                { label: "Email", value: detailsEmail },
                { label: "Current role", value: currentRole },
                ...approvalContactDetails,
                { label: "Status", value: nextStepCopy.statusLabel },
                ...importedNotificationDetails,
                ...attachmentDetails,
              ],
              text: approverText,
              ctaUrl: approvalPageUrl || approvalsUrl || requestUrl,
              ctaLabel: nextStepCopy.ctaLabel,
              approveUrl: approvalPageUrl ? `${approvalPageUrl}#approve` : requestUrl,
              rejectUrl: approvalPageUrl ? `${approvalPageUrl}#reject` : requestUrl,
              commentUrl: requestUrl ? `${requestUrl}/approve#comment` : "",
              viewAllUrl: approvalsUrl || requestUrl,
            }),
          );
          const processorQueueStep = importedApprovalChain.find(
            (step) => isProcessorRole(String(step.role || "")) && String(step.approverEmail || "").trim(),
          );
          if (
            processorQueueStep?.approverEmail &&
            String(processorQueueStep.approverEmail).trim().toLowerCase() !==
              String(firstSlaApprover?.approverEmail || "").trim().toLowerCase()
          ) {
            notificationJobs.push(
              sendFlowNotification({
                formSlug: slug,
                formName: imported.name,
                event: "submitted",
                to: String(processorQueueStep.approverEmail).trim().toLowerCase(),
                primaryRecipientRole: "processor",
                subject: `${imported.name} request submitted for processing awareness (${referenceNo})`,
                summary:
                  "A new request has entered the workflow. You are the assigned Processor and will receive another notification when it reaches your step.",
                details: [
                  { label: "Reference No.", value: referenceNo },
                  { label: "Requester", value: detailsName },
                  { label: "Email", value: detailsEmail },
                  { label: "Current workflow step", value: currentRole || "Approver" },
                  { label: "Status", value: "Pending approval" },
                  ...approvalContactDetails,
                  ...importedNotificationDetails,
                  ...attachmentDetails,
                ],
                text:
                  `A new ${imported.name} request has entered the workflow.\n\n` +
                  `You are the assigned Processor for this request and will receive another notification when it reaches your step.\n\n` +
                  `Reference: ${referenceNo}\n` +
                  (requestUrl ? `Link: ${requestUrl}\n` : ""),
                ctaUrl: requestUrl,
                ctaLabel: "Open request",
              }),
            );
          }
        }
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
        message: `${imported.name} submitted and notifications sent to submitter + HR: ${referenceNo}.${triggerMessageSuffix}`,
      });
    } catch (notificationError) {
      console.error("Imported form submit notification failed:", notificationError);
    }

    redirect(`/requests/${encodeURIComponent(referenceNo)}`);
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
