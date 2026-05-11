"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { completeAdminJob, failAdminJob, startAdminJob } from "@/lib/admin-jobs";
import { connectMongo } from "@/lib/db/mongo";
import { syncEmployeesFromGraph } from "@/lib/employee-sync";
import { setFlashToast } from "@/lib/flash";
import { AuditLog } from "@/models/AuditLog";

const EMPLOYEE_INFO_PATH = "/admin/users";

export async function syncEmployeesDirectory() {
  const { email } = await requireAdmin();
  await connectMongo();
  const job = await startAdminJob({
    type: "employee-sync",
    actorEmail: email,
    targetType: "employee-directory",
    targetId: "graph",
    summary: "Syncing employees from Microsoft Graph.",
  });

  try {
    const result = await syncEmployeesFromGraph();
    const summary =
      `Employee sync completed. ${result.processed} employees synced` +
      `${result.skipped > 0 ? `, ${result.skipped} skipped` : ""}` +
      `${result.deviceEnriched > 0 ? `, ${result.deviceEnriched} device summaries updated` : ""}` +
      `${result.employeeIdFallbackCount > 0 ? `, ${result.employeeIdFallbackCount} employee IDs found in fallback fields` : ""}` +
      `${result.employeeIdMissingCount > 0 ? `, ${result.employeeIdMissingCount} still missing an employee ID` : ""}.`;

    await AuditLog.create({
      actorEmail: email,
      action: "employee.sync.graph",
      targetType: "employee-directory",
      targetId: "graph",
      outcome: "success",
      details: result,
    });
    await completeAdminJob(String(job._id), {
      summary,
      metadata: result,
    });

    await setFlashToast({
      tone: "success",
      message: summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Employee sync failed.";

    await AuditLog.create({
      actorEmail: email,
      action: "employee.sync.graph",
      targetType: "employee-directory",
      targetId: "graph",
      outcome: "error",
      details: { message },
    });
    await failAdminJob(String(job._id), {
      summary: "Employee sync failed.",
      errorMessage: message,
      metadata: { message },
    });

    await setFlashToast({
      tone: "error",
      message,
      persistent: true,
    });
  }

  revalidatePath(EMPLOYEE_INFO_PATH);
  revalidatePath("/admin");
  redirect(EMPLOYEE_INFO_PATH);
}
