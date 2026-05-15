import mongoose from "mongoose";
import { readSpreadsheetMatrix, appendSpreadsheetRow, writeSpreadsheetRow } from "../src/lib/google/sheets.js";

const SPREADSHEET_ID = "1-Ml75zLsLUvackWpjnitqcfJwaL1OtBBKyq7PRZ82vM";
const SHEET = "REQUEST FOR FIXED ASSET ITEM CODE";
const TARGET_SLUG = "request-for-fixed-asset-item-code";
const HEADERS = [
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
];

function s(v) {
  return String(v ?? "").trim();
}

function getValue(values = {}, labels = {}, ...aliases) {
  const wanted = aliases.map((a) => a.toLowerCase().replace(/[^a-z0-9]+/g, ""));
  for (const [key, value] of Object.entries(values)) {
    const k = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const label = s(labels[key]).toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (wanted.some((w) => w === k || w === label)) return s(value);
  }
  return "";
}

function normalizeRef(v) {
  return s(v).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

async function ensureHeaders() {
  const rows = await readSpreadsheetMatrix(SPREADSHEET_ID, `${SHEET}!A1:Z1`);
  const existing = (rows[0] ?? []).map((v) => s(v));
  const needsWrite = existing.length !== HEADERS.length || HEADERS.some((h, i) => existing[i] !== h);
  if (needsWrite) {
    await writeSpreadsheetRow({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!A1`,
      values: HEADERS,
    });
  }
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not defined.");
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false, serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;

  await ensureHeaders();
  const sheetRows = await readSpreadsheetMatrix(SPREADSHEET_ID, `${SHEET}!A1:Z5000`);
  const existingRefs = new Set(
    sheetRows.slice(1).map((row) => normalizeRef(row?.[1])).filter(Boolean),
  );

  const requests = await db
    .collection("requests")
    .find({ formSlug: TARGET_SLUG }, { projection: { referenceNo: 1, submittedBy: 1, formData: 1, createdAt: 1 } })
    .sort({ createdAt: 1 })
    .toArray();

  let inserted = 0;
  for (const req of requests) {
    const reference = s(req.referenceNo);
    if (!reference || existingRefs.has(normalizeRef(reference))) continue;
    const values = req?.formData?.values ?? {};
    const labels = req?.formData?.fieldLabels ?? {};
    const timestamp = new Date(req.createdAt ?? Date.now()).toLocaleString("en-PH", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Manila",
    });
    const row = [
      timestamp,
      reference,
      s(req?.submittedBy?.name),
      s(req?.submittedBy?.email),
      getValue(values, labels, "capexbudget", "capex budget"),
      getValue(values, labels, "description", "item description"),
      getValue(values, labels, "assetclass", "asset class", "assetcategory", "asset category"),
      getValue(values, labels, "department"),
      getValue(values, labels, "subdepartment", "sub-department"),
      getValue(values, labels, "location"),
      getValue(values, labels, "projectname", "project name"),
      getValue(values, labels, "totalcost", "total cost", "approvedannualbudget", "approved annual budget"),
      getValue(values, labels, "supportingdocument", "supporting document"),
      getValue(values, labels, "assigneditemcode", "assigned item code"),
      getValue(values, labels, "ponumber", "po number"),
      getValue(values, labels, "emailstatus", "email status"),
    ];
    await appendSpreadsheetRow({ spreadsheetId: SPREADSHEET_ID, sheetTitle: SHEET, values: row });
    inserted += 1;
  }

  console.log(`Backfill complete. Inserted ${inserted} row(s).`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("backfill-fixed-asset-item-code-sheet failed:", error);
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
