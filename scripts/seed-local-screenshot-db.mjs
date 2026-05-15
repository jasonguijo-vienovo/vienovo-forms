import fs from "node:fs/promises";
import path from "node:path";
import { MongoClient, ObjectId } from "mongodb";

const DB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018/vienovo_forms";

function addHours(base, hours) {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function addDays(base, days) {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

async function readPrimaryAdminEmail() {
  const envPath = path.resolve(process.cwd(), ".env");
  const content = await fs.readFile(envPath, "utf8");
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith("ADMIN_EMAILS="));

  if (!line) {
    return "jerome.corpus@vienovo.ph";
  }

  const first = line.replace(/^ADMIN_EMAILS=/, "").split(",")[0]?.trim().toLowerCase();
  return first || "jerome.corpus@vienovo.ph";
}

function formDefinitionBase(overrides = {}) {
  return {
    description: "",
    routePath: "",
    externalFormUrl: "",
    source: "imported",
    isDeleted: false,
    status: "published",
    visibility: "everyone",
    availability: "available",
    isImplemented: true,
    showInNavbar: true,
    sortOrder: 90,
    levelOneApproverId: "",
    levelOneApproverName: "",
    levelOneApproverEmail: "",
    levelTwoApproverId: "",
    levelTwoApproverName: "",
    levelTwoApproverEmail: "",
    processorApproverId: "",
    processorApproverName: "",
    processorApproverEmail: "",
    writeResponsesToSheet: false,
    responseSpreadsheetId: "",
    responseSheetName: "",
    triggerEnabled: false,
    triggerUrl: "",
    triggerSource: "",
    triggerEvent: "",
    triggerFunctionName: "",
    triggerNotes: "",
    notes: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function main() {
  const adminEmail = await readPrimaryAdminEmail();
  const adminName = "Jerome Corpus";
  const processorEmail = "dave.mundia@vienovo.ph";
  const processorName = "Ricky Dave Mundia";
  const delegateEmail = "aileen.guerrero@vienovo.ph";
  const delegateName = "Aileen Guerrero";
  const secondUserEmail = "mika.delao@vienovo.ph";
  const secondUserName = "Mika Delao";
  const now = new Date();

  const client = new MongoClient(DB_URI);
  await client.connect();
  const db = client.db();

  await db.dropDatabase();

  const importedPublishedId = new ObjectId();
  const importedDraftId = new ObjectId();

  const fixedAssetsHtml = `
    <html>
      <head>
        <title>Fixed Assets Release</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f4f7f5; color: #1f2937; }
          .sheet { max-width: 860px; margin: 16px auto; background: white; border: 1px solid #cfe3d6; border-radius: 12px; padding: 24px; }
          h1 { margin-top: 0; color: #14532d; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
          label { display: block; font-size: 13px; font-weight: 700; margin-bottom: 4px; }
          input, select, textarea { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
          textarea { min-height: 88px; }
          .full { grid-column: 1 / -1; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <h1>Fixed Assets Release</h1>
          <p>Release and transfer fixed assets between teams or locations.</p>
          <div class="grid">
            <div><label for="employeeName">Employee name</label><input id="employeeName" name="employeeName" type="text" /></div>
            <div><label for="department">Department</label><select id="department" name="department"><option>IT</option><option>Operations</option><option>Warehouse</option></select></div>
            <div><label for="assetType">Asset type</label><select id="assetType" name="assetType"><option>Laptop</option><option>Monitor</option><option>Printer</option></select></div>
            <div><label for="targetSite">Target site</label><input id="targetSite" name="targetSite" type="text" /></div>
            <div class="full"><label for="businessReason">Business reason</label><textarea id="businessReason" name="businessReason"></textarea></div>
          </div>
        </div>
      </body>
    </html>
  `.trim();

  const importedDraftHtml = `
    <html>
      <head><title>Visitor Pass Request</title></head>
      <body>
        <h1>Visitor Pass Request</h1>
        <p>Draft form still under review.</p>
        <label for="visitorName">Visitor name</label>
        <input id="visitorName" name="visitorName" type="text" />
      </body>
    </html>
  `.trim();

  const lookups = [
    { category: "department", value: "IT", label: "IT", sortOrder: 1, isActive: true },
    { category: "department", value: "Operations", label: "Operations", sortOrder: 2, isActive: true },
    { category: "department", value: "Warehouse", label: "Warehouse", sortOrder: 3, isActive: true },
    { category: "airport", value: "Manila", label: "Manila", sortOrder: 1, isActive: true },
    { category: "airport", value: "Cebu", label: "Cebu", sortOrder: 2, isActive: true },
    { category: "airport", value: "Davao", label: "Davao", sortOrder: 3, isActive: true },
    { category: "multiCityDeparture", value: "Cebu", label: "Cebu", sortOrder: 1, isActive: true },
    { category: "airline", value: "Cebu Pacific", label: "Cebu Pacific", sortOrder: 1, isActive: true },
    { category: "airline", value: "PAL", label: "PAL", sortOrder: 2, isActive: true },
    { category: "baggage", value: "20 kg", label: "20 kg", sortOrder: 1, isActive: true },
    { category: "cashAdvancePayableTo", value: "Employee", label: "Employee", sortOrder: 1, isActive: true },
    { category: "cashAdvancePayableTo", value: "Supplier", label: "Supplier", sortOrder: 2, isActive: true },
    { category: "reimbursementFormType", value: "Expense Reimbursement", label: "Expense Reimbursement", sortOrder: 1, isActive: true },
    { category: "reimbursementFormType", value: "CA Liquidation", label: "CA Liquidation", sortOrder: 2, isActive: true },
    { category: "reimbursementLiquidationType", value: "Liquidation", label: "Liquidation", sortOrder: 1, isActive: true },
    { category: "reimbursementCostCenter", value: "INFORMATION TECHNOLOGY", label: "INFORMATION TECHNOLOGY", sortOrder: 1, isActive: true },
    { category: "reimbursementLocation", value: "MAKATI OFFICE", label: "MAKATI OFFICE", sortOrder: 1, isActive: true },
  ].map((entry) => ({ ...entry, createdAt: now, updatedAt: now }));

  const approvers = [
    { name: adminName, email: adminEmail, roles: ["supervisor", "head", "cashAdvanceApprover"], employeeId: "EMP-001", department: "IT", jobTitle: "IT Manager", emailNeedsReview: false, isActive: true },
    { name: processorName, email: processorEmail, roles: ["processor"], employeeId: "EMP-002", department: "Finance", jobTitle: "Processor", emailNeedsReview: false, isActive: true },
    { name: delegateName, email: delegateEmail, roles: ["supervisor", "head", "cashAdvanceApprover"], employeeId: "EMP-003", department: "Operations", jobTitle: "Operations Head", emailNeedsReview: false, isActive: true },
    { name: "Rachel Remulta", email: "rachel@vienovo.ph", roles: ["supervisor", "cashAdvanceApprover"], employeeId: "EMP-004", department: "Sales", jobTitle: "Regional Supervisor", emailNeedsReview: false, isActive: true },
  ].map((entry) => ({ ...entry, createdAt: now, updatedAt: now }));

  const employees = [
    { email: adminEmail, employeeId: "EMP-001", fullName: adminName, department: "IT", jobTitle: "IT Manager", contactNumber: "09171234567", birthday: new Date("1990-03-12"), supervisorEmail: adminEmail, departmentHeadEmail: adminEmail, isActive: true, syncSource: "graph", lastSyncedAt: addHours(now, -5), entraUserId: "entra-admin-001", deviceSummary: { deviceCount: 2, compliantDeviceCount: 2, nonCompliantDeviceCount: 0, lastSyncAt: addHours(now, -5) } },
    { email: processorEmail, employeeId: "EMP-002", fullName: processorName, department: "Finance", jobTitle: "Processor", contactNumber: "09179876543", birthday: new Date("1987-08-18"), supervisorEmail: delegateEmail, departmentHeadEmail: delegateEmail, isActive: true, syncSource: "graph", lastSyncedAt: addHours(now, -3), entraUserId: "entra-proc-002", deviceSummary: { deviceCount: 1, compliantDeviceCount: 1, nonCompliantDeviceCount: 0, lastSyncAt: addHours(now, -3) } },
    { email: secondUserEmail, employeeId: "EMP-005", fullName: secondUserName, department: "Warehouse", jobTitle: "Warehouse Analyst", contactNumber: "09170000000", birthday: new Date("1995-11-02"), supervisorEmail: delegateEmail, departmentHeadEmail: adminEmail, isActive: true, syncSource: "graph", lastSyncedAt: addHours(now, -2), entraUserId: "entra-user-005", deviceSummary: { deviceCount: 1, compliantDeviceCount: 1, nonCompliantDeviceCount: 0, lastSyncAt: addHours(now, -2) } },
  ].map((entry) => ({ ...entry, createdAt: now, updatedAt: now }));

  const users = [
    { email: adminEmail, name: adminName, image: "", role: "admin", firstSeenAt: addDays(now, -30), lastSeenAt: addHours(now, -1), createdAt: addDays(now, -30), updatedAt: addHours(now, -1) },
    { email: secondUserEmail, name: secondUserName, image: "", role: "user", firstSeenAt: addDays(now, -12), lastSeenAt: addHours(now, -9), createdAt: addDays(now, -12), updatedAt: addHours(now, -9) },
  ];

  const reimbursementRoutes = [
    {
      department: "IT",
      costCenter: "INFORMATION TECHNOLOGY",
      location: "MAKATI OFFICE",
      supervisorEmail: adminEmail,
      supervisorName: adminName,
      headEmail: delegateEmail,
      headName: delegateName,
      sortOrder: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const formImports = [
    {
      _id: importedPublishedId,
      name: "Fixed Assets Release",
      slug: "fixed-assets-release",
      sourceType: "google-apps-script",
      externalFormUrl: "",
      spreadsheetId: "local-sheet-fixed-assets",
      spreadsheetBindings: { department: "Departments!A2:A", assetType: "Assets!A2:A" },
      writeResponsesToSheet: true,
      responseSheetName: "Fixed Assets Release Responses",
      htmlSource: fixedAssetsHtml,
      appsScriptSource: "function submitFixedAssetsRelease() {}",
      notes: "Representative imported form used for local screenshot capture.",
      status: "implemented",
      readinessState: "ready",
      sourceChecksum: "fixed-assets-v1",
      sourceVersion: 3,
      lastParsedAt: addHours(now, -4),
      parseDiagnostics: {
        parsedTitle: "Fixed Assets Release",
        parsedDescription: "Release and transfer fixed assets between teams or locations.",
        parsedFieldCount: 5,
        fieldNames: ["employeeName", "department", "assetType", "targetSite", "businessReason"],
        detectedTriggerFunctions: ["submitFixedAssetsRelease"],
        detectedTriggerEvents: ["submit"],
        missingBindings: [],
        warnings: ["Legacy inline styles are still preserved in the imported frame."],
        blockers: [],
        warningCount: 1,
        blockerCount: 0,
      },
      createdByEmail: adminEmail,
      createdByName: adminName,
      summary: { inputCount: 3, selectCount: 2, textareaCount: 1, scriptFunctionCount: 1 },
      createdAt: addDays(now, -8),
      updatedAt: addHours(now, -4),
    },
    {
      _id: importedDraftId,
      name: "Visitor Pass Request",
      slug: "visitor-pass-request",
      sourceType: "google-apps-script",
      externalFormUrl: "",
      spreadsheetId: "local-sheet-visitor-pass",
      spreadsheetBindings: {},
      writeResponsesToSheet: false,
      responseSheetName: "Visitor Pass Responses",
      htmlSource: importedDraftHtml,
      appsScriptSource: "function submitVisitorPass() {}",
      notes: "Intentionally blocked draft for importer screenshots.",
      status: "draft",
      readinessState: "blocked",
      sourceChecksum: "visitor-pass-v1",
      sourceVersion: 1,
      lastParsedAt: addHours(now, -26),
      parseDiagnostics: {
        parsedTitle: "Visitor Pass Request",
        parsedDescription: "Draft form still under review.",
        parsedFieldCount: 1,
        fieldNames: ["visitorName"],
        detectedTriggerFunctions: ["submitVisitorPass"],
        detectedTriggerEvents: ["submit"],
        missingBindings: ["hostApprover"],
        warnings: ["Response destination still needs to be configured."],
        blockers: ["No live registry entry exists yet.", "Required host approver binding is missing."],
        warningCount: 1,
        blockerCount: 2,
      },
      createdByEmail: adminEmail,
      createdByName: adminName,
      summary: { inputCount: 1, selectCount: 0, textareaCount: 0, scriptFunctionCount: 1 },
      createdAt: addDays(now, -3),
      updatedAt: addHours(now, -20),
    },
  ];

  const formDefinitions = [
    formDefinitionBase({
      slug: "fixed-assets-release",
      name: "Fixed Assets Release",
      description: "Imported form for moving fixed assets between sites.",
      routePath: "/forms/fixed-assets-release",
      source: "imported",
      status: "published",
      visibility: "everyone",
      availability: "available",
      isImplemented: true,
      showInNavbar: true,
      sortOrder: 80,
      writeResponsesToSheet: true,
      responseSpreadsheetId: "local-sheet-fixed-assets",
      responseSheetName: "Fixed Assets Release Responses",
      importSourceId: importedPublishedId,
      notes: "Live imported form.",
      createdAt: addDays(now, -8),
      updatedAt: addHours(now, -4),
    }),
    formDefinitionBase({
      slug: "visitor-pass-request",
      name: "Visitor Pass Request",
      description: "Draft imported form still blocked from publishing.",
      routePath: "/forms/visitor-pass-request",
      source: "imported",
      status: "draft",
      visibility: "admin",
      availability: "coming-soon",
      isImplemented: false,
      showInNavbar: false,
      sortOrder: 95,
      importSourceId: importedDraftId,
      notes: "Blocked imported draft.",
      createdAt: addDays(now, -3),
      updatedAt: addHours(now, -20),
    }),
  ];

  const notificationFlows = [
    { formSlug: "travel-booking", formName: "Travel Booking", isActive: true, notifyOnSubmit: true, notifyNextApprover: true, notifySubmitterOnApproved: true, notifySubmitterOnRejected: true, extraRecipients: ["traveldesk@vienovo.ph"], notes: "Primary travel workflow", createdAt: now, updatedAt: now },
    { formSlug: "cash-advance", formName: "Cash Advance", isActive: true, notifyOnSubmit: true, notifyNextApprover: false, notifySubmitterOnApproved: true, notifySubmitterOnRejected: true, extraRecipients: ["finance@vienovo.ph"], notes: "Finance-only escalation", createdAt: now, updatedAt: now },
    { formSlug: "reimbursement", formName: "Reimbursement", isActive: true, notifyOnSubmit: true, notifyNextApprover: true, notifySubmitterOnApproved: true, notifySubmitterOnRejected: true, extraRecipients: [], notes: "Default reimbursement flow", createdAt: now, updatedAt: now },
    { formSlug: "fixed-assets-release", formName: "Fixed Assets Release", isActive: false, notifyOnSubmit: true, notifyNextApprover: true, notifySubmitterOnApproved: false, notifySubmitterOnRejected: true, extraRecipients: ["assets@vienovo.ph"], notes: "Imported-form pilot flow", createdAt: now, updatedAt: now },
  ];

  const notificationDeliveryLogs = [
    { formSlug: "travel-booking", formName: "Travel Booking", event: "submit", recipient: adminEmail, subject: "Travel booking received", status: "sent", error: "", text: "Travel booking submitted.", html: "<p>Travel booking submitted.</p>", replayable: false, retryOfLogId: null, resentAt: null, resentByEmail: "", sentAt: addHours(now, -6), createdAt: addHours(now, -6), updatedAt: addHours(now, -6) },
    { formSlug: "fixed-assets-release", formName: "Fixed Assets Release", event: "next-approver", recipient: delegateEmail, subject: "Approval notification failed", status: "failed", error: "SMTP authentication failed.", text: "Approval email failed.", html: "<p>Approval email failed.</p>", replayable: true, retryOfLogId: null, resentAt: null, resentByEmail: "", sentAt: addHours(now, -12), createdAt: addHours(now, -12), updatedAt: addHours(now, -12) },
    { formSlug: "reimbursement", formName: "Reimbursement", event: "approved", recipient: secondUserEmail, subject: "Reimbursement approved", status: "failed", error: "Mailbox unavailable.", text: "Reimbursement approved.", html: "<p>Reimbursement approved.</p>", replayable: true, retryOfLogId: null, resentAt: null, resentByEmail: "", sentAt: addHours(now, -30), createdAt: addHours(now, -30), updatedAt: addHours(now, -30) },
  ];

  const adminJobs = [
    { type: "employee-sync", status: "succeeded", actorEmail: adminEmail, targetType: "employee", targetId: "graph-sync", summary: "Graph employee sync completed", errorMessage: "", metadata: { synced: 42 }, retryCount: 0, queuedAt: addHours(now, -8), lastHeartbeatAt: addHours(now, -7.8), startedAt: addHours(now, -8), finishedAt: addHours(now, -7.75), durationMs: 900000, createdAt: addHours(now, -8), updatedAt: addHours(now, -7.75) },
    { type: "import-publish", status: "running", actorEmail: adminEmail, targetType: "form-import", targetId: String(importedPublishedId), summary: "Publishing imported fixed assets form", errorMessage: "", metadata: { form: "fixed-assets-release" }, retryCount: 0, queuedAt: addHours(now, -1), lastHeartbeatAt: addMinutes(now, -10), startedAt: addHours(now, -1), finishedAt: null, durationMs: null, createdAt: addHours(now, -1), updatedAt: addMinutes(now, -10) },
    { type: "bulk-approval", status: "failed", actorEmail: adminEmail, targetType: "request", targetId: "TRV-2026-0004", summary: "Bulk approval batch failed", errorMessage: "One request was reassigned during processing.", metadata: { attempted: 3, succeeded: 2, failed: 1 }, retryCount: 1, queuedAt: addHours(now, -16), lastHeartbeatAt: addHours(now, -15.8), startedAt: addHours(now, -16), finishedAt: addHours(now, -15.7), durationMs: 1080000, createdAt: addHours(now, -16), updatedAt: addHours(now, -15.7) },
  ];

  const auditLogs = [
    { actorEmail: adminEmail, action: "update_notification_flow", targetType: "NotificationFlow", targetId: "travel-booking", correlationId: "corr-001", outcome: "success", before: null, after: { notifyNextApprover: true }, context: { page: "/admin/notifications" }, details: { change: "Enabled next approver emails." }, createdAt: addHours(now, -5), updatedAt: addHours(now, -5) },
    { actorEmail: adminEmail, action: "delete_import_draft", targetType: "FormImport", targetId: String(importedDraftId), correlationId: "corr-002", outcome: "warning", before: { status: "draft" }, after: null, context: { page: "/admin/form-imports" }, details: { note: "Draft removed from staging." }, createdAt: addHours(now, -18), updatedAt: addHours(now, -18) },
    { actorEmail: adminEmail, action: "edit_request_settings", targetType: "Request", targetId: "TRV-2026-0002", correlationId: "corr-003", outcome: "success", before: { status: "returned" }, after: { status: "pending" }, context: { page: "/requests/TRV-2026-0002/edit" }, details: { note: "Requester updated schedule." }, createdAt: addHours(now, -26), updatedAt: addHours(now, -26) },
  ];

  const approvalDelegations = [
    {
      delegatorEmail: delegateEmail,
      delegatorName: delegateName,
      delegateEmail: adminEmail,
      delegateName: adminName,
      reason: "Regional travel coverage",
      startsAt: addDays(now, -1),
      endsAt: addDays(now, 3),
      isActive: true,
      createdByEmail: delegateEmail,
      revokedAt: null,
      revokedByEmail: "",
      createdAt: addDays(now, -1),
      updatedAt: addDays(now, -1),
    },
    {
      delegatorEmail: adminEmail,
      delegatorName: adminName,
      delegateEmail: processorEmail,
      delegateName: processorName,
      reason: "Processor backup coverage",
      startsAt: addDays(now, -2),
      endsAt: addDays(now, 2),
      isActive: true,
      createdByEmail: adminEmail,
      revokedAt: null,
      revokedByEmail: "",
      createdAt: addDays(now, -2),
      updatedAt: addDays(now, -2),
    },
  ];

  const travelPendingCreated = addDays(now, -2);
  const returnedCreated = addDays(now, -5);
  const approvedCreated = addDays(now, -9);
  const rejectedCreated = addDays(now, -7);
  const importedCreated = addDays(now, -1);
  const processorCreated = addDays(now, -4);

  const requests = [
    {
      formType: "travel-booking",
      formSlug: "travel-booking",
      formName: "Travel Booking",
      referenceNo: "TRV-2026-0001",
      requestNo: "TRV-0001",
      submittedBy: { email: adminEmail, name: adminName },
      formData: {
        employeeId: "EMP-001",
        fullName: adminName,
        department: "IT",
        birthday: "1990-03-12",
        contactNumber: "09171234567",
        landAir: "Air",
        tripType: "roundtrip",
        origin: "Manila",
        destination: "Cebu",
        departureDate: "2026-05-20",
        returnDate: "2026-05-22",
        preferredTime: "08:30",
        airline: "Cebu Pacific",
        travelPurpose: "Leadership review and branch visit",
        baggage: "20 kg",
        hotelAccommodation: "Company booked",
        hotelOther: "2 nights near Cebu office",
        servicePickup: "Airport pickup required",
        immediateSuperiorName: adminName,
        immediateSuperiorEmail: adminEmail,
        departmentHeadName: delegateName,
        departmentHeadEmail: delegateEmail,
        activityScheduleFileName: "travel-plan.pdf",
        activitySchedule: {
          fileName: "travel-plan.pdf",
          driveWebViewLink: "https://drive.google.com/file/d/travel-plan/view",
        },
      },
      approvalChain: [
        { step: 1, role: "supervisor", approverEmail: adminEmail, approverName: adminName, status: "pending", actedAt: null, comment: "" },
        { step: 2, role: "head", approverEmail: delegateEmail, approverName: delegateName, status: "waiting", actedAt: null, comment: "" },
        { step: 3, role: "processor", approverEmail: processorEmail, approverName: processorName, status: "waiting", actedAt: null, comment: "" },
      ],
      currentStep: 1,
      status: "pending",
      history: [
        { at: travelPendingCreated, byEmail: adminEmail, byName: adminName, action: "submitted", details: { role: "requester" } },
      ],
      currentActorEmail: adminEmail,
      currentActorName: adminName,
      currentRole: "supervisor",
      queueBucket: "pending-approval",
      lastActionAt: addHours(travelPendingCreated, 2),
      lastActionBy: adminName,
      responseSpreadsheetId: "local-sheet-travel",
      responseSheetName: "Travel Booking Responses",
      sheetStatusSyncedAt: addHours(travelPendingCreated, 3),
      sheetStatusSyncError: "",
      createdAt: travelPendingCreated,
      updatedAt: addHours(travelPendingCreated, 6),
    },
    {
      formType: "travel-booking",
      formSlug: "travel-booking",
      formName: "Travel Booking",
      referenceNo: "TRV-2026-0002",
      requestNo: "TRV-0002",
      submittedBy: { email: adminEmail, name: adminName },
      formData: {
        employeeId: "EMP-001",
        fullName: adminName,
        department: "IT",
        birthday: "1990-03-12",
        contactNumber: "09171234567",
        landAir: "Air",
        tripType: "roundtrip",
        origin: "Manila",
        destination: "Davao",
        departureDate: "2026-05-12",
        returnDate: "2026-05-14",
        preferredTime: "13:00",
        airline: "PAL",
        travelPurpose: "Supplier visit and returned corrections",
        baggage: "20 kg",
        hotelAccommodation: "Book separately",
        hotelOther: "Requested closer venue",
        servicePickup: "No pickup needed",
        immediateSuperiorName: adminName,
        immediateSuperiorEmail: adminEmail,
        departmentHeadName: delegateName,
        departmentHeadEmail: delegateEmail,
        activityScheduleFileName: "updated-itinerary.pdf",
        activitySchedule: {
          fileName: "updated-itinerary.pdf",
          driveWebViewLink: "https://drive.google.com/file/d/updated-itinerary/view",
        },
      },
      approvalChain: [
        { step: 1, role: "supervisor", approverEmail: adminEmail, approverName: adminName, status: "returned", actedAt: addDays(returnedCreated, 2), comment: "Please clarify the hotel details before I approve this trip." },
        { step: 2, role: "head", approverEmail: delegateEmail, approverName: delegateName, status: "waiting", actedAt: null, comment: "" },
        { step: 3, role: "processor", approverEmail: processorEmail, approverName: processorName, status: "waiting", actedAt: null, comment: "" },
      ],
      currentStep: 1,
      status: "returned",
      history: [
        { at: returnedCreated, byEmail: adminEmail, byName: adminName, action: "submitted", details: { role: "requester" } },
        { at: addDays(returnedCreated, 2), byEmail: adminEmail, byName: adminName, action: "returned", details: { role: "supervisor", comment: "Please clarify the hotel details before I approve this trip." } },
        { at: addDays(returnedCreated, 3), byEmail: adminEmail, byName: adminName, action: "edited", details: { changedFields: { hotelOther: { from: "TBD", to: "Requested closer venue" }, preferredTime: { from: "09:00", to: "13:00" } } } },
      ],
      currentActorEmail: "",
      currentActorName: "",
      currentRole: "",
      queueBucket: "returned",
      lastActionAt: addDays(returnedCreated, 3),
      lastActionBy: adminName,
      responseSpreadsheetId: "local-sheet-travel",
      responseSheetName: "Travel Booking Responses",
      sheetStatusSyncedAt: addDays(returnedCreated, 3),
      sheetStatusSyncError: "",
      createdAt: returnedCreated,
      updatedAt: addDays(returnedCreated, 3),
    },
    {
      formType: "cash-advance",
      formSlug: "cash-advance",
      formName: "Cash Advance",
      referenceNo: "CA-2026-0001",
      requestNo: "CA-0001",
      submittedBy: { email: adminEmail, name: adminName },
      formData: {
        firstName: "Jerome",
        lastName: "Corpus",
        payablesTo: "Employee",
        payeeName: adminName,
        amount: 12500,
        reason: "Travel expenses for Cebu leadership review",
        forApprovalNote: "Please release before the trip.",
        supportingFileName: "cash-advance-quote.pdf",
        supportingDocument: {
          fileName: "cash-advance-quote.pdf",
          driveWebViewLink: "https://drive.google.com/file/d/cash-advance-quote/view",
        },
        approverName: adminName,
        approverEmail: adminEmail,
        agreedToAuthorization: true,
      },
      approvalChain: [
        { step: 1, role: "cashAdvanceApprover", approverEmail: adminEmail, approverName: adminName, status: "approved", actedAt: addDays(approvedCreated, 1), comment: "Approved for immediate release." },
        { step: 2, role: "processor", approverEmail: processorEmail, approverName: processorName, status: "approved", actedAt: addDays(approvedCreated, 1.2), comment: "Processed and released." },
      ],
      currentStep: 2,
      status: "approved",
      history: [
        { at: approvedCreated, byEmail: adminEmail, byName: adminName, action: "submitted", details: { role: "requester" } },
        { at: addDays(approvedCreated, 1), byEmail: adminEmail, byName: adminName, action: "approved", details: { role: "cashAdvanceApprover", comment: "Approved for immediate release." } },
        { at: addDays(approvedCreated, 1.2), byEmail: processorEmail, byName: processorName, action: "approved", details: { role: "processor", comment: "Processed and released." } },
      ],
      currentActorEmail: "",
      currentActorName: "",
      currentRole: "",
      queueBucket: "approved",
      lastActionAt: addDays(approvedCreated, 1.2),
      lastActionBy: processorName,
      responseSpreadsheetId: "local-sheet-cash-advance",
      responseSheetName: "Cash Advance Responses",
      sheetStatusSyncedAt: addDays(approvedCreated, 1.2),
      sheetStatusSyncError: "",
      createdAt: approvedCreated,
      updatedAt: addDays(approvedCreated, 1.2),
    },
    {
      formType: "reimbursement",
      formSlug: "reimbursement",
      formName: "Reimbursement",
      referenceNo: "RMB-2026-0001",
      requestNo: "RMB-0001",
      submittedBy: { email: adminEmail, name: adminName },
      formData: {
        firstName: "Jerome",
        lastName: "Corpus",
        department: "IT",
        costCenter: "INFORMATION TECHNOLOGY",
        location: "MAKATI OFFICE",
        totalExpenses: 6420,
        formType: "Expense Reimbursement",
        cashAdvanceReferenceNo: "CA-2026-0001",
        reason: "Client visit meal and transport expenses",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-02",
        liquidationType: "Liquidation",
        transactionNumber: "TXN-7781",
        psNumber: "PS-2239",
        businessPartner: "VNO-Partner",
        jvNo: "JV-1022",
        expensesByCode: { travel: 4200, meals: 1220, misc: 1000 },
        supportingFileName: "reimbursement-receipts.pdf",
        supportingDocument: {
          fileName: "reimbursement-receipts.pdf",
          driveWebViewLink: "https://drive.google.com/file/d/reimbursement-receipts/view",
        },
        immediateSuperiorName: adminName,
        immediateSuperiorEmail: adminEmail,
        departmentHeadName: delegateName,
        departmentHeadEmail: delegateEmail,
        agreedToCertification: true,
      },
      approvalChain: [
        { step: 1, role: "supervisor", approverEmail: adminEmail, approverName: adminName, status: "rejected", actedAt: addDays(rejectedCreated, 1), comment: "Please route this through the updated cost center." },
        { step: 2, role: "head", approverEmail: delegateEmail, approverName: delegateName, status: "waiting", actedAt: null, comment: "" },
      ],
      currentStep: 1,
      status: "rejected",
      history: [
        { at: rejectedCreated, byEmail: adminEmail, byName: adminName, action: "submitted", details: { role: "requester" } },
        { at: addDays(rejectedCreated, 1), byEmail: adminEmail, byName: adminName, action: "rejected", details: { role: "supervisor", comment: "Please route this through the updated cost center." } },
      ],
      currentActorEmail: "",
      currentActorName: "",
      currentRole: "",
      queueBucket: "rejected",
      lastActionAt: addDays(rejectedCreated, 1),
      lastActionBy: adminName,
      responseSpreadsheetId: "local-sheet-reimbursement",
      responseSheetName: "Reimbursement Responses",
      sheetStatusSyncedAt: addDays(rejectedCreated, 1),
      sheetStatusSyncError: "",
      createdAt: rejectedCreated,
      updatedAt: addDays(rejectedCreated, 1),
    },
    {
      formType: "imported",
      formSlug: "fixed-assets-release",
      formName: "Fixed Assets Release",
      referenceNo: "IMP-2026-0001",
      requestNo: "IMP-0001",
      submittedBy: { email: adminEmail, name: adminName },
      formData: {
        importedFormName: "Fixed Assets Release",
        fieldLabels: {
          employeeName: "Employee name",
          department: "Department",
          assetType: "Asset type",
          targetSite: "Target site",
          businessReason: "Business reason",
        },
        values: {
          employeeName: adminName,
          department: "IT",
          assetType: "Laptop",
          targetSite: "Cebu Warehouse",
          businessReason: "Transfer replacement device for branch leadership use.",
        },
      },
      approvalChain: [],
      currentStep: 0,
      status: "submitted",
      history: [
        { at: importedCreated, byEmail: adminEmail, byName: adminName, action: "submitted", details: { role: "requester" } },
      ],
      currentActorEmail: "",
      currentActorName: "",
      currentRole: "",
      queueBucket: "submitted",
      lastActionAt: importedCreated,
      lastActionBy: adminName,
      responseSpreadsheetId: "local-sheet-fixed-assets",
      responseSheetName: "Fixed Assets Release Responses",
      sheetStatusSyncedAt: importedCreated,
      sheetStatusSyncError: "",
      createdAt: importedCreated,
      updatedAt: addHours(importedCreated, 1),
    },
    {
      formType: "reimbursement",
      formSlug: "reimbursement",
      formName: "Reimbursement",
      referenceNo: "RMB-2026-0002",
      requestNo: "RMB-0002",
      submittedBy: { email: secondUserEmail, name: secondUserName },
      formData: {
        firstName: "Mika",
        lastName: "Delao",
        department: "Warehouse",
        costCenter: "INFORMATION TECHNOLOGY",
        location: "MAKATI OFFICE",
        totalExpenses: 3890,
        formType: "Expense Reimbursement",
        cashAdvanceReferenceNo: "",
        reason: "Urgent warehouse systems replacement transport",
        dateFrom: "2026-05-03",
        dateTo: "2026-05-03",
        liquidationType: "Liquidation",
        transactionNumber: "TXN-9921",
        psNumber: "PS-3301",
        businessPartner: "VNO Logistics",
        jvNo: "JV-4421",
        expensesByCode: { transport: 3890 },
        supportingFileName: "warehouse-receipts.pdf",
        supportingDocument: {
          fileName: "warehouse-receipts.pdf",
          driveWebViewLink: "https://drive.google.com/file/d/warehouse-receipts/view",
        },
        immediateSuperiorName: delegateName,
        immediateSuperiorEmail: delegateEmail,
        departmentHeadName: adminName,
        departmentHeadEmail: adminEmail,
        agreedToCertification: true,
      },
      approvalChain: [
        { step: 1, role: "supervisor", approverEmail: delegateEmail, approverName: delegateName, status: "approved", actedAt: addDays(processorCreated, 1), comment: "Approved and escalated." },
        { step: 2, role: "processor", approverEmail: processorEmail, approverName: processorName, status: "pending", actedAt: null, comment: "" },
      ],
      currentStep: 2,
      status: "pending",
      history: [
        { at: processorCreated, byEmail: secondUserEmail, byName: secondUserName, action: "submitted", details: { role: "requester" } },
        { at: addDays(processorCreated, 1), byEmail: delegateEmail, byName: delegateName, action: "approved", details: { role: "supervisor", comment: "Approved and escalated." } },
      ],
      currentActorEmail: processorEmail,
      currentActorName: processorName,
      currentRole: "processor",
      queueBucket: "needs-processor",
      lastActionAt: addDays(processorCreated, 1),
      lastActionBy: delegateName,
      responseSpreadsheetId: "local-sheet-reimbursement",
      responseSheetName: "Reimbursement Responses",
      sheetStatusSyncedAt: addDays(processorCreated, 1),
      sheetStatusSyncError: "",
      createdAt: processorCreated,
      updatedAt: addDays(processorCreated, 1),
    },
  ];

  await Promise.all([
    db.collection("lookups").insertMany(lookups),
    db.collection("approvers").insertMany(approvers),
    db.collection("employees").insertMany(employees),
    db.collection("users").insertMany(users),
    db.collection("reimbursementroutes").insertMany(reimbursementRoutes),
    db.collection("formimports").insertMany(formImports),
    db.collection("formdefinitions").insertMany(formDefinitions),
    db.collection("notificationflows").insertMany(notificationFlows),
    db.collection("notificationdeliverylogs").insertMany(notificationDeliveryLogs),
    db.collection("adminjobs").insertMany(adminJobs),
    db.collection("auditlogs").insertMany(auditLogs),
    db.collection("approvaldelegations").insertMany(approvalDelegations),
    db.collection("requests").insertMany(requests),
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        adminEmail,
        inserted: {
          lookups: lookups.length,
          approvers: approvers.length,
          employees: employees.length,
          users: users.length,
          reimbursementRoutes: reimbursementRoutes.length,
          formImports: formImports.length,
          formDefinitions: formDefinitions.length,
          notificationFlows: notificationFlows.length,
          notificationDeliveryLogs: notificationDeliveryLogs.length,
          adminJobs: adminJobs.length,
          auditLogs: auditLogs.length,
          approvalDelegations: approvalDelegations.length,
          requests: requests.length,
        },
      },
      null,
      2,
    ),
  );

  await client.close();
}

function addMinutes(base, minutes) {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

await main();
