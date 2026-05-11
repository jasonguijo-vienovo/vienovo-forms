import { connectMongo } from "@/lib/db/mongo";
import { ApprovalDelegation } from "@/models/ApprovalDelegation";

export type ActiveApprovalDelegation = {
  id: string;
  delegatorEmail: string;
  delegatorName: string;
  delegateEmail: string;
  delegateName: string;
  reason: string;
  startsAt: string;
  endsAt: string;
};

function normalizeEmail(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

function activeWindowFilter(now = new Date()) {
  return {
    isActive: true,
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gte: now } }],
  };
}

export async function listActiveDelegationsForUser(email: string) {
  await connectMongo();
  const normalizedEmail = normalizeEmail(email);
  const [toMe, fromMe] = await Promise.all([
    ApprovalDelegation.find({
      ...activeWindowFilter(),
      delegateEmail: normalizedEmail,
    })
      .sort({ startsAt: -1 })
      .lean(),
    ApprovalDelegation.find({
      ...activeWindowFilter(),
      delegatorEmail: normalizedEmail,
    })
      .sort({ startsAt: -1 })
      .lean(),
  ]);

  return {
    toMe: toMe.map(toDto),
    fromMe: fromMe.map(toDto),
  };
}

export async function getActiveDelegatorEmailsForDelegate(email: string) {
  await connectMongo();
  const rows = await ApprovalDelegation.find({
    ...activeWindowFilter(),
    delegateEmail: normalizeEmail(email),
  })
    .select({ delegatorEmail: 1 })
    .lean();
  return rows.map((row) => normalizeEmail(row.delegatorEmail)).filter(Boolean);
}

export async function findActiveDelegation(opts: {
  delegatorEmail: string;
  delegateEmail: string;
}) {
  await connectMongo();
  return ApprovalDelegation.findOne({
    ...activeWindowFilter(),
    delegatorEmail: normalizeEmail(opts.delegatorEmail),
    delegateEmail: normalizeEmail(opts.delegateEmail),
  }).lean();
}

function toDto(row: any): ActiveApprovalDelegation {
  return {
    id: String(row._id),
    delegatorEmail: normalizeEmail(row.delegatorEmail),
    delegatorName: String(row.delegatorName ?? ""),
    delegateEmail: normalizeEmail(row.delegateEmail),
    delegateName: String(row.delegateName ?? ""),
    reason: String(row.reason ?? ""),
    startsAt: row.startsAt ? new Date(row.startsAt).toISOString() : "",
    endsAt: row.endsAt ? new Date(row.endsAt).toISOString() : "",
  };
}
