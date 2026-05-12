import mongoose from "mongoose";

const SPREADSHEET_ID = "1-Ml75zLsLUvackWpjnitqcfJwaL1OtBBKyq7PRZ82vM";

const FORMS = [
  {
    name: "Request for Fixed Asset Item Code",
    slug: "request-for-fixed-asset-item-code",
    scriptFormName: "REQUEST FOR FIXED ASSET ITEM CODE",
    sheet: "REQUEST FOR FIXED ASSET ITEM CODE",
    card: "card-c1",
    htmlSource: `
<div class="page-wrap">
<div class="form-card">
<form>
  <h2>Request for Fixed Asset Item Code</h2>
  <label>CAPEX Budget<input name="capexBudget" required /></label>
  <label>Description<input name="description" required /></label>
  <label>Department<input name="department" required /></label>
  <label>Asset Category
    <select name="assetCategory" required>
      <option value="">Select category</option>
      <option>Computer Equipment</option><option>Office Furniture</option><option>Office Equipment</option>
      <option>Machinery</option><option>Vehicle</option><option>Building / Leasehold</option><option>Other</option>
    </select>
  </label>
  <label>Approved Annual Budget<input name="approvedAnnualBudget" type="number" step="0.01" required /></label>
  <label>Actual CAPEX Posted<input name="actualCapexPosted" type="number" step="0.01" /></label>
  <label>Committed CAPEX<input name="committedCapex" type="number" step="0.01" /></label>
  <label>Without Item Code<input name="withoutItemCode" type="number" min="0" /></label>
  <label>With Item Code<input name="withItemCode" type="number" min="0" /></label>
  <button type="submit">Submit Request</button>
</form>
</div>
</div>`,
  },
  {
    name: "Department's Existing Fixed Asset Inventory",
    slug: "departments-existing-fixed-asset-inventory",
    scriptFormName: "DEPARTMENTS EXISTING FIXED ASSET INVENTORY",
    sheet: "Existing Asset Inventory",
    card: "card-c2",
    htmlSource: `
<div class="page-wrap">
<div class="form-card">
<form>
  <h2>Department's Existing Fixed Asset Inventory</h2>
  <label>Date of Inventory<input name="dateOfInventory" type="date" required /></label>
  <label>Department<input name="department" required /></label>
  <label>Prepared By<input name="preparedBy" required /></label>
  <label>Position<input name="position" /></label>
  <label>Asset Code<input name="assetCode" required /></label>
  <label>Asset Description<input name="assetDescription" required /></label>
  <label>Brand/Model<input name="brandModel" /></label>
  <label>Serial Number<input name="serialNumber" /></label>
  <label>Date Acquired<input name="dateAcquired" type="date" /></label>
  <label>Acquisition Cost<input name="acquisitionCost" type="number" step="0.01" /></label>
  <label>Condition
    <select name="condition" required>
      <option value="">Select condition</option>
      <option>Excellent</option><option>Good</option><option>Fair</option><option>Poor</option><option>For Disposal</option>
    </select>
  </label>
  <label>Location<input name="location" /></label>
  <label>Assigned Personnel<input name="assignedPersonnel" /></label>
  <label>Remarks<input name="remarks" /></label>
  <button type="submit">Submit Inventory</button>
</form>
</div>
</div>`,
  },
  {
    name: "Fixed Assets Additions Form",
    slug: "fixed-assets-additions-form",
    scriptFormName: "FIXED ASSETS ADDITIONS FORM",
    sheet: "Fixed Assets Additions",
    card: "card-c3",
    htmlSource: `
<div class="page-wrap">
<div class="form-card">
<form>
  <h2>Fixed Assets Additions Form</h2>
  <label>Date<input name="date" type="date" required /></label>
  <label>Department<input name="department" required /></label>
  <label>Asset Code<input name="assetCode" /></label>
  <label>Asset Category<input name="assetCategory" required /></label>
  <label>Asset Description<input name="assetDescription" required /></label>
  <label>Brand<input name="brand" /></label>
  <label>Model<input name="model" /></label>
  <label>Serial Number<input name="serialNumber" /></label>
  <label>Location<input name="location" /></label>
  <label>Supplier<input name="supplier" required /></label>
  <label>Invoice Number<input name="invoiceNumber" /></label>
  <label>Purchase Date<input name="purchaseDate" type="date" required /></label>
  <label>Purchase Price<input name="purchasePrice" type="number" step="0.01" required /></label>
  <label>Useful Life<input name="usefulLife" type="number" min="1" /></label>
  <label>Depreciation Method<input name="depreciationMethod" /></label>
  <label>Authorized By<input name="authorizedBy" required /></label>
  <label>Received By<input name="receivedBy" /></label>
  <label>Remarks<textarea name="remarks"></textarea></label>
  <button type="submit">Submit Addition</button>
</form>
</div>
</div>`,
  },
  {
    name: "Employee Assets Accountability Form",
    slug: "employee-assets-accountability-form",
    scriptFormName: "EMPLOYEE ASSETS ACCOUNTABILITY FORM",
    sheet: "Employee Accountability",
    card: "card-c4",
    htmlSource: `
<div class="page-wrap">
<div class="form-card">
<form>
  <h2>Employee Assets Accountability Form</h2>
  <label>Date Issued<input name="dateIssued" type="date" required /></label>
  <label>Employee Name<input name="employeeName" required /></label>
  <label>Employee ID<input name="employeeId" required /></label>
  <label>Department<input name="department" required /></label>
  <label>Position<input name="position" required /></label>
  <label>Contact Number<input name="contactNumber" /></label>
  <label>Asset Code<input name="assetCode" required /></label>
  <label>Asset Description<input name="assetDescription" required /></label>
  <label>Serial Number<input name="serialNumber" /></label>
  <label>Condition at Issuance<input name="conditionAtIssuance" required /></label>
  <label>Expected Return Date<input name="expectedReturnDate" type="date" /></label>
  <label>Issued By<input name="issuedBy" required /></label>
  <label>Acknowledgment<input name="acknowledgment" type="checkbox" value="Acknowledged" required /></label>
  <label>Remarks<textarea name="remarks"></textarea></label>
  <button type="submit">Submit Form</button>
</form>
</div>
</div>`,
  },
  {
    name: "Fixed Assets Control Log Form",
    slug: "fixed-assets-control-log-form",
    scriptFormName: "FIXED ASSETS CONTROL LOG FORM",
    sheet: "Control Log",
    card: "card-c5",
    htmlSource: `
<div class="page-wrap">
<div class="form-card">
<form>
  <h2>Fixed Assets Control Log Form</h2>
  <label>Date<input name="date" type="date" required /></label>
  <label>Transaction Type<input name="transactionType" required /></label>
  <label>Asset Code<input name="assetCode" required /></label>
  <label>Asset Description<input name="assetDescription" required /></label>
  <label>From Location<input name="fromLocation" /></label>
  <label>To Location<input name="toLocation" required /></label>
  <label>Condition Before<input name="conditionBefore" /></label>
  <label>Condition After<input name="conditionAfter" /></label>
  <label>Reason<textarea name="reason" required></textarea></label>
  <label>Authorized By<input name="authorizedBy" required /></label>
  <label>Released By<input name="releasedBy" /></label>
  <label>Received By<input name="receivedBy" /></label>
  <label>Date Completed<input name="dateCompleted" type="date" /></label>
  <label>Remarks<textarea name="remarks"></textarea></label>
  <button type="submit">Submit Log Entry</button>
</form>
</div>
</div>`,
  },
];

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not defined.");

  await mongoose.connect(mongoUri, { bufferCommands: false, serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  const formImports = db.collection("formimports");
  const formDefinitions = db.collection("formdefinitions");
  const now = new Date();

  for (let i = 0; i < FORMS.length; i += 1) {
    const form = FORMS[i];

    await formImports.updateOne(
      { slug: form.slug },
      {
        $set: {
          name: form.name,
          slug: form.slug,
          sourceType: "google-apps-script",
          externalFormUrl: "",
          spreadsheetId: SPREADSHEET_ID,
          spreadsheetBindings: {},
          writeResponsesToSheet: true,
          responseSheetName: form.sheet,
          htmlSource: form.htmlSource,
          appsScriptSource: `processFormSubmission(formData, "${form.scriptFormName}")`,
          notes: `Fixed Assets imported module (${form.card})`,
          status: "implemented",
          readinessState: "ready",
          sourceVersion: 1,
          sourceChecksum: "",
          lastParsedAt: now,
          parseDiagnostics: {
            parsedTitle: form.name,
            parsedDescription: "Fixed Assets imported module",
            parsedFieldCount: 1,
            fieldNames: ["importedPayload"],
            missingBindings: [],
            warnings: [],
            blockers: [],
            warningCount: 0,
            blockerCount: 0,
          },
          summary: { inputCount: 1, selectCount: 0, textareaCount: 0, scriptFunctionCount: 1 },
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
          createdByEmail: "system@local",
          createdByName: "System",
        },
      },
      { upsert: true },
    );

    const importRecord = await formImports.findOne(
      { slug: form.slug },
      { projection: { _id: 1 } },
    );

    await formDefinitions.updateOne(
      { slug: form.slug },
      {
        $set: {
          slug: form.slug,
          name: form.name,
          description: "Fixed Assets imported form for operational submissions.",
          routePath: `/forms/${form.slug}`,
          source: "imported",
          importSourceId: importRecord?._id ?? null,
          externalFormUrl: "",
          notes: `Connected to spreadsheet ${SPREADSHEET_ID}`,
          status: "published",
          visibility: "everyone",
          availability: "available",
          showInNavbar: true,
          isImplemented: true,
          writeResponsesToSheet: true,
          responseSpreadsheetId: SPREADSHEET_ID,
          responseSheetName: form.sheet,
          sortOrder: 200 + i,
          isDeleted: false,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  const rows = await formDefinitions
    .find(
      { slug: { $in: FORMS.map((form) => form.slug) } },
      {
        projection: {
          slug: 1,
          name: 1,
          status: 1,
          visibility: 1,
          responseSpreadsheetId: 1,
          responseSheetName: 1,
        },
      },
    )
    .sort({ sortOrder: 1 })
    .toArray();

  console.log("Fixed Assets forms synced:");
  for (const row of rows) {
    console.log(
      `${row.slug} | ${row.status}/${row.visibility} | ${row.responseSpreadsheetId} | ${row.responseSheetName}`,
    );
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("sync-fixed-assets-forms failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exitCode = 1;
});
