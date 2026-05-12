"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { completeAdminJob, failAdminJob, startAdminJob } from "@/lib/admin-jobs";
import { connectMongo } from "@/lib/db/mongo";
import { syncEmployeesFromGraph } from "@/lib/employee-sync";
import { setFlashToast } from "@/lib/flash";
import { AuditLog } from "@/models/AuditLog";
import { AdminJob } from "@/models/AdminJob";
import { SyncState } from "@/models/SyncState";

const EMPLOYEE_INFO_PATH = "/admin/users";

export async function syncEmployeesDirectory() {
  const { email } = await requireAdmin();
  await connectMongo();
  await runEmployeeSync(email);

  revalidatePath(EMPLOYEE_INFO_PATH);
  revalidatePath("/admin");
  redirect(EMPLOYEE_INFO_PATH);
}

export async function retryEmployeeSyncJob(formData: FormData) {
  const { email } = await requireAdmin();
  const jobId = String(formData.get("jobId") ?? "").trim();
  await connectMongo();

  const previousJob = jobId
    ? await AdminJob.findOne({ _id: jobId, type: "employee-sync", status: "failed" })
        .select({ _id: 1 })
        .lean()
    : null;

  if (!previousJob) {
    await setFlashToast({
      tone: "error",
      message: "That failed sync job could not be found anymore.",
      persistent: true,
    });
    redirect(EMPLOYEE_INFO_PATH);
  }

  await runEmployeeSync(email, String(previousJob._id));

  revalidatePath(EMPLOYEE_INFO_PATH);
  revalidatePath("/admin");
  redirect(EMPLOYEE_INFO_PATH);
}

async function runEmployeeSync(actorEmail: string, retryOfJobId = "") {
  const job = await startAdminJob({
    type: "employee-sync",
    actorEmail,
    targetType: "employee-directory",
    targetId: "graph",
    summary: retryOfJobId
      ? "Retrying employee sync from Microsoft Graph."
      : "Syncing employees from Microsoft Graph.",
    metadata: retryOfJobId ? { retryOfJobId } : {},
  });

  try {
    const result = await syncEmployeesFromGraph();
    const summary =
      `Employee ${result.syncMode} sync completed. ${result.processed} employees synced` +
      `${result.skipped > 0 ? `, ${result.skipped} skipped` : ""}` +
      `${result.removed > 0 ? `, ${result.removed} deactivated from removed delta records` : ""}` +
      `${result.deviceEnriched > 0 ? `, ${result.deviceEnriched} device summaries updated` : ""}` +
      `${result.employeeIdFallbackCount > 0 ? `, ${result.employeeIdFallbackCount} employee IDs found in fallback fields` : ""}` +
      `${result.employeeIdMissingCount > 0 ? `, ${result.employeeIdMissingCount} still missing an employee ID` : ""}.`;

    await AuditLog.create({
      actorEmail,
      action: "employee.sync.graph",
      targetType: "employee-directory",
      targetId: "graph",
      outcome: "success",
      details: { ...result, retryOfJobId },
    });
    await completeAdminJob(String(job._id), {
      summary,
      metadata: { ...result, retryOfJobId },
    });

    await setFlashToast({
      tone: "success",
      message: summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Employee sync failed.";

    await AuditLog.create({
      actorEmail,
      action: "employee.sync.graph",
      targetType: "employee-directory",
      targetId: "graph",
      outcome: "error",
      details: { message, retryOfJobId },
    });
    await failAdminJob(String(job._id), {
      summary: retryOfJobId ? "Employee sync retry failed." : "Employee sync failed.",
      errorMessage: message,
      metadata: { message, retryOfJobId },
    });
    await SyncState.updateOne(
      { key: "employee-graph-users" },
      {
        $setOnInsert: { key: "employee-graph-users" },
        $set: {
          lastErrorAt: new Date(),
          lastErrorMessage: message,
        },
      },
      { upsert: true },
    );

    await setFlashToast({
      tone: "error",
      message,
      persistent: true,
    });
  }
}
