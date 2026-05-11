"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { syncEmployeesFromGraph } from "@/lib/employee-sync";
import { setFlashToast } from "@/lib/flash";
import { AuditLog } from "@/models/AuditLog";

const EMPLOYEE_INFO_PATH = "/admin/users";

export async function syncEmployeesDirectory() {
  const { email } = await requireAdmin();
  await connectMongo();

  try {
    const result = await syncEmployeesFromGraph();

    await AuditLog.create({
      actorEmail: email,
      action: "employee.sync.graph",
      targetType: "employee-directory",
      targetId: "graph",
      outcome: "success",
      details: result,
    });

    await setFlashToast({
      tone: "success",
      message:
        `Employee sync completed. ${result.processed} employees synced` +
        `${result.skipped > 0 ? `, ${result.skipped} skipped` : ""}` +
        `${result.deviceEnriched > 0 ? `, ${result.deviceEnriched} device summaries updated` : ""}.`,
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
