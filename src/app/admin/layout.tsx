import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { AdminShell } from "@/components/admin-shell";
import { getAdminSession } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { AuditLog } from "@/models/AuditLog";
import { RequestModel } from "@/models/Request";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAdmin, session } = await getAdminSession();
  if (!isAdmin) redirect("/dashboard");
  const email = session?.user?.email ?? "";
  await connectMongo();

  const [approvalItems, systemItems] = await Promise.all([
    RequestModel.find({
      queueBucket: "pending-approval",
      status: { $in: ["pending", "submitted", "returned"] },
    })
      .sort({ updatedAt: -1 })
      .limit(8)
      .select({ referenceNo: 1, formName: 1, currentActorName: 1, currentActorEmail: 1, updatedAt: 1 })
      .lean(),
    AuditLog.find({
      action: { $regex: /(update|error|delete|edit)/i },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select({ action: 1, actorEmail: 1, targetType: 1, targetId: 1, createdAt: 1, outcome: 1 })
      .lean(),
  ]);

  return (
    <AdminShell
      email={email}
      approvalNotifications={approvalItems.map((item: any) => ({
        referenceNo: String(item.referenceNo || ""),
        formName: String(item.formName || "Request"),
        assignee: String(item.currentActorName || item.currentActorEmail || "Unassigned"),
        updatedAt: new Date(item.updatedAt).toISOString(),
      }))}
      systemNotifications={systemItems.map((item: any) => ({
        action: String(item.action || "update"),
        actorEmail: String(item.actorEmail || "system"),
        target: `${String(item.targetType || "")}:${String(item.targetId || "")}`.replace(/:$/, ""),
        outcome: String(item.outcome || "success"),
        createdAt: new Date(item.createdAt).toISOString(),
      }))}
      onSignOut={async () => {
        "use server";
        await signOut({ redirectTo: "/sign-in" });
      }}
    >
      {children}
    </AdminShell>
  );
}
