import mongoose from "mongoose";

const SPREADSHEET_ID = "1-Ml75zLsLUvackWpjnitqcfJwaL1OtBBKyq7PRZ82vM";

const FORMS = [
  {
    name: "Request for Fixed Asset Item Code",
    slug: "request-for-fixed-asset-item-code",
    scriptFormName: "REQUEST FOR FIXED ASSET ITEM CODE",
    sheet: "REQUEST FOR FIXED ASSET ITEM CODE",
    card: "card-c1",
  },
  {
    name: "Department's Existing Fixed Asset Inventory",
    slug: "departments-existing-fixed-asset-inventory",
    scriptFormName: "DEPARTMENTS EXISTING FIXED ASSET INVENTORY",
    sheet: "Existing Asset Inventory",
    card: "card-c2",
  },
  {
    name: "Fixed Assets Additions Form",
    slug: "fixed-assets-additions-form",
    scriptFormName: "FIXED ASSETS ADDITIONS FORM",
    sheet: "Fixed Assets Additions",
    card: "card-c3",
  },
  {
    name: "Employee Assets Accountability Form",
    slug: "employee-assets-accountability-form",
    scriptFormName: "EMPLOYEE ASSETS ACCOUNTABILITY FORM",
    sheet: "Employee Accountability",
    card: "card-c4",
  },
  {
    name: "Fixed Assets Control Log Form",
    slug: "fixed-assets-control-log-form",
    scriptFormName: "FIXED ASSETS CONTROL LOG FORM",
    sheet: "Control Log",
    card: "card-c5",
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
          htmlSource: `<!-- Fixed Assets ${form.card} imported module placeholder -->`,
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
