import { connectMongo } from "@/lib/db/mongo";
import { RequestModel } from "@/models/Request";
import { Employee } from "@/models/Employee";

export type AdminEmployeeListRow = {
  email: string;
  fullName: string;
  employeeId: string;
  department: string;
  jobTitle: string;
  supervisorEmail: string;
  departmentHeadEmail: string;
  isActive: boolean;
  syncSource: string;
  lastSyncedAt: string;
  totalRequests: number;
  recentRequests30d: number;
  lastRequestAt: string;
  lastRequestReferenceNo: string;
  lastRequestStatus: string;
  lastRequestFormName: string;
  deviceSummary: {
    deviceCount: number;
    compliantDeviceCount: number;
    nonCompliantDeviceCount: number;
    lastSyncAt: string;
  };
};

export type AdminEmployeeDetail = {
  employee: AdminEmployeeListRow;
  requestSummary: {
    total: number;
    recent30d: number;
    pending: number;
    approved: number;
    returned: number;
    rejected: number;
    submitted: number;
  };
  recentRequests: Array<{
    referenceNo: string;
    formName: string;
    formSlug: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    currentActorName: string;
    currentActorEmail: string;
  }>;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString();
}

function normalizeEmail(value: string | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function getAllowedDomain() {
  return String(process.env.INTUNE_ALLOWED_EMAIL_DOMAIN ?? "vienovo.ph")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

function isCompanyEmail(email: string) {
  const allowedDomain = getAllowedDomain();
  return Boolean(email && (!allowedDomain || email.endsWith(`@${allowedDomain}`)));
}

function buildEmployeeRow(doc: any, requestSummary?: any): AdminEmployeeListRow {
  return {
    email: normalizeEmail(doc.email),
    fullName: String(doc.fullName ?? "").trim() || normalizeEmail(doc.email),
    employeeId: String(doc.employeeId ?? "").trim(),
    department: String(doc.department ?? "").trim(),
    jobTitle: String(doc.jobTitle ?? "").trim(),
    supervisorEmail: String(doc.supervisorEmail ?? "").trim().toLowerCase(),
    departmentHeadEmail: String(doc.departmentHeadEmail ?? "").trim().toLowerCase(),
    isActive: doc.isActive !== false,
    syncSource: String(doc.syncSource ?? "").trim(),
    lastSyncedAt: toIso(doc.lastSyncedAt),
    totalRequests: Number(requestSummary?.totalRequests ?? 0),
    recentRequests30d: Number(requestSummary?.recentRequests30d ?? 0),
    lastRequestAt: toIso(requestSummary?.lastRequestAt),
    lastRequestReferenceNo: String(requestSummary?.lastRequestReferenceNo ?? "").trim(),
    lastRequestStatus: String(requestSummary?.lastRequestStatus ?? "").trim(),
    lastRequestFormName: String(requestSummary?.lastRequestFormName ?? "").trim(),
    deviceSummary: {
      deviceCount: Number(doc.deviceSummary?.deviceCount ?? 0),
      compliantDeviceCount: Number(doc.deviceSummary?.compliantDeviceCount ?? 0),
      nonCompliantDeviceCount: Number(doc.deviceSummary?.nonCompliantDeviceCount ?? 0),
      lastSyncAt: toIso(doc.deviceSummary?.lastSyncAt),
    },
  };
}

async function getRequestSummaryByEmail() {
  const recentCutoff = new Date();
  recentCutoff.setUTCDate(recentCutoff.getUTCDate() - 30);

  const rows = await RequestModel.aggregate([
    { $match: { "submittedBy.email": { $ne: "" } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$submittedBy.email",
        requesterName: { $first: "$submittedBy.name" },
        totalRequests: { $sum: 1 },
        recentRequests30d: {
          $sum: {
            $cond: [{ $gte: ["$createdAt", recentCutoff] }, 1, 0],
          },
        },
        lastRequestAt: { $first: "$createdAt" },
        lastRequestReferenceNo: { $first: "$referenceNo" },
        lastRequestStatus: { $first: "$status" },
        lastRequestFormName: { $first: "$formName" },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [
      normalizeEmail(String(row._id ?? "")),
      {
        requesterName: String(row.requesterName ?? "").trim(),
        totalRequests: Number(row.totalRequests ?? 0),
        recentRequests30d: Number(row.recentRequests30d ?? 0),
        lastRequestAt: row.lastRequestAt,
        lastRequestReferenceNo: String(row.lastRequestReferenceNo ?? "").trim(),
        lastRequestStatus: String(row.lastRequestStatus ?? "").trim(),
        lastRequestFormName: String(row.lastRequestFormName ?? "").trim(),
      },
    ]),
  );
}

export async function getAdminEmployeesDirectory() {
  await connectMongo();
  const requestSummaryByEmail = await getRequestSummaryByEmail();

  const docs = await Employee.find({})
    .sort({ fullName: 1, email: 1 })
    .select({
      email: 1,
      fullName: 1,
      employeeId: 1,
      department: 1,
      jobTitle: 1,
      supervisorEmail: 1,
      departmentHeadEmail: 1,
      isActive: 1,
      syncSource: 1,
      lastSyncedAt: 1,
      deviceSummary: 1,
    })
    .lean();

  const rows = new Map<string, AdminEmployeeListRow>();

  for (const doc of docs) {
    const email = normalizeEmail(doc.email);
    if (!email) continue;
    rows.set(email, buildEmployeeRow(doc, requestSummaryByEmail.get(email)));
  }

  for (const [email, requestSummary] of requestSummaryByEmail.entries()) {
    if (rows.has(email) || !isCompanyEmail(email)) continue;
    rows.set(
      email,
      buildEmployeeRow(
        {
          email,
          fullName: requestSummary.requesterName || email,
          employeeId: "",
          department: "",
          jobTitle: "",
          supervisorEmail: "",
          departmentHeadEmail: "",
          isActive: true,
          syncSource: "",
          lastSyncedAt: null,
          deviceSummary: {
            deviceCount: 0,
            compliantDeviceCount: 0,
            nonCompliantDeviceCount: 0,
            lastSyncAt: null,
          },
        },
        requestSummary,
      ),
    );
  }

  return [...rows.values()].sort((a, b) => {
    const byName = a.fullName.localeCompare(b.fullName);
    if (byName !== 0) return byName;
    return a.email.localeCompare(b.email);
  });
}

export async function getAdminEmployeeDetailByEmail(rawEmail: string): Promise<AdminEmployeeDetail | null> {
  const email = normalizeEmail(decodeURIComponent(rawEmail));
  if (!email) return null;

  await connectMongo();

  const recentCutoff = new Date();
  recentCutoff.setUTCDate(recentCutoff.getUTCDate() - 30);

  const [doc, summaryRows, recentRequests] = await Promise.all([
    Employee.findOne({ email })
      .select({
        email: 1,
        fullName: 1,
        employeeId: 1,
        department: 1,
        jobTitle: 1,
        supervisorEmail: 1,
        departmentHeadEmail: 1,
        isActive: 1,
        syncSource: 1,
        lastSyncedAt: 1,
        deviceSummary: 1,
      })
      .lean(),
    RequestModel.aggregate([
      { $match: { "submittedBy.email": email } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          recent30d: {
            $sum: {
              $cond: [{ $gte: ["$createdAt", recentCutoff] }, 1, 0],
            },
          },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
          returned: { $sum: { $cond: [{ $eq: ["$status", "returned"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
          submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
          requesterName: { $first: "$submittedBy.name" },
          lastRequestAt: { $max: "$createdAt" },
        },
      },
    ]),
    RequestModel.find({ "submittedBy.email": email })
      .sort({ createdAt: -1 })
      .limit(15)
      .select({
        referenceNo: 1,
        formName: 1,
        formSlug: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        currentActorName: 1,
        currentActorEmail: 1,
      })
      .lean(),
  ]);

  const summary = summaryRows[0] ?? {
    total: 0,
    recent30d: 0,
    pending: 0,
    approved: 0,
    returned: 0,
    rejected: 0,
    submitted: 0,
    requesterName: "",
    lastRequestAt: null,
  };

  if (!doc && Number(summary.total ?? 0) === 0) return null;

  const employee = buildEmployeeRow(
    doc ?? {
      email,
      fullName: String(summary.requesterName ?? "").trim() || email,
      employeeId: "",
      department: "",
      jobTitle: "",
      supervisorEmail: "",
      departmentHeadEmail: "",
      isActive: true,
      syncSource: "",
      lastSyncedAt: null,
      deviceSummary: {
        deviceCount: 0,
        compliantDeviceCount: 0,
        nonCompliantDeviceCount: 0,
        lastSyncAt: null,
      },
    },
    {
      totalRequests: summary.total,
      recentRequests30d: summary.recent30d,
      lastRequestAt: summary.lastRequestAt,
      lastRequestReferenceNo: "",
      lastRequestStatus: "",
      lastRequestFormName: "",
    },
  );

  return {
    employee,
    requestSummary: {
      total: Number(summary.total ?? 0),
      recent30d: Number(summary.recent30d ?? 0),
      pending: Number(summary.pending ?? 0),
      approved: Number(summary.approved ?? 0),
      returned: Number(summary.returned ?? 0),
      rejected: Number(summary.rejected ?? 0),
      submitted: Number(summary.submitted ?? 0),
    },
    recentRequests: recentRequests.map((request: any) => ({
      referenceNo: String(request.referenceNo ?? ""),
      formName: String(request.formName ?? ""),
      formSlug: String(request.formSlug ?? ""),
      status: String(request.status ?? ""),
      createdAt: toIso(request.createdAt),
      updatedAt: toIso(request.updatedAt),
      currentActorName: String(request.currentActorName ?? ""),
      currentActorEmail: String(request.currentActorEmail ?? ""),
    })),
  };
}
