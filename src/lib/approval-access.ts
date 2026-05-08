import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { safeAuth } from "@/lib/safe-auth";
import { Approver } from "@/models/Approver";
import { RequestModel } from "@/models/Request";

function normalizeEmail(email: string | null | undefined) {
  return String(email ?? "").trim().toLowerCase();
}

export async function getApprovalAccess(email: string | null | undefined) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return {
      email: "",
      isAdmin: false,
      isApprover: false,
      canAccessApprovals: false,
    };
  }

  const isAdmin = isAdminEmail(normalizedEmail);
  if (isAdmin) {
    return {
      email: normalizedEmail,
      isAdmin: true,
      isApprover: false,
      canAccessApprovals: true,
    };
  }

  await connectMongo();

  const [approverRecord, requestMatch] = await Promise.all([
    Approver.exists({
      email: normalizedEmail,
      isActive: true,
    }),
    RequestModel.exists({
      "approvalChain.approverEmail": normalizedEmail,
    }),
  ]);

  const isApprover = Boolean(approverRecord || requestMatch);

  return {
    email: normalizedEmail,
    isAdmin,
    isApprover,
    canAccessApprovals: isAdmin || isApprover,
  };
}

export async function canAccessApprovals(email: string | null | undefined) {
  const access = await getApprovalAccess(email);
  return access.canAccessApprovals;
}

export async function requireApprovalsAccess() {
  const session = await safeAuth();
  const email = normalizeEmail(session?.user?.email);

  if (!email) {
    redirect("/sign-in?callbackUrl=/approvals");
  }

  const access = await getApprovalAccess(email);
  if (!access.canAccessApprovals) {
    redirect("/dashboard");
  }

  return {
    session: session!,
    ...access,
  };
}
