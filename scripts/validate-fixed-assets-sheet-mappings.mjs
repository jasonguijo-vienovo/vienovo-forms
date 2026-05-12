import mongoose from "mongoose";
import { readSpreadsheetMatrix } from "../src/lib/google/sheets.js";

const SPREADSHEET_ID = "1-Ml75zLsLUvackWpjnitqcfJwaL1OtBBKyq7PRZ82vM";
const checks = [
  { slug: "request-for-fixed-asset-item-code", sheet: "REQUEST FOR FIXED ASSET ITEM CODE", required: ["Timestamp", "Reference", "CAPEX BUDGET"] },
  { slug: "departments-existing-fixed-asset-inventory", sheet: "Existing Asset Inventory", required: ["Timestamp", "DEPARMENT", "Ref"] },
  { slug: "fixed-assets-additions-form", sheet: "Fixed Assets Additions", required: ["Timestamp", "RefID", "Status"] },
  { slug: "employee-assets-accountability-form", sheet: "Employee Accountability", required: ["Timestamp", "ID Number", "RefID"] },
  { slug: "fixed-assets-control-log-form", sheet: "Control Log", required: ["Timestamp", "RefID", "Type of Change"] },
];

async function main() {
  for (const item of checks) {
    const headers = (await readSpreadsheetMatrix(SPREADSHEET_ID, `${item.sheet}!A1:ZZ1`))[0]?.map((v) => String(v ?? "").trim()) ?? [];
    const missing = item.required.filter((h) => !headers.includes(h));
    if (missing.length) {
      console.error(`[FAIL] ${item.slug} -> ${item.sheet} missing: ${missing.join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log(`[OK] ${item.slug} -> ${item.sheet}`);
    }
  }
}

main().finally(async () => {
  try { await mongoose.disconnect(); } catch {}
});
