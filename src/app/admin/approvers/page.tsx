import { connectMongo } from "@/lib/db/mongo";
import { getAdminEmployeePickerOptions } from "@/lib/employee-admin";
import { isEmployeeDirectorySyncConfigured, isEmployeeDirectorySyncEnabled } from "@/lib/employee-sync";
import { Approver, APPROVER_ROLES } from "@/models/Approver";
import { ApproversClient } from "./ApproversClient";

export default async function ApproversPage() {
  await connectMongo();
  const [all, employeeOptions] = await Promise.all([
    Approver.find({}).sort({ name: 1 }).lean(),
    getAdminEmployeePickerOptions(),
  ]);
  const dynamicRoles = Array.from(new Set(all.flatMap((item) => item.roles || []).filter(Boolean))).sort();
  const roles = Array.from(new Set([...APPROVER_ROLES, ...dynamicRoles])).filter(
    (role) => String(role).trim().toLowerCase() !== "far",
  );

  return (
    <ApproversClient
      approvers={all.map((item) => ({
        _id: String(item._id),
        name: item.name,
        email: item.email,
        employeeId: item.employeeId || "",
        roles: item.roles,
        isActive: item.isActive,
        emailNeedsReview: item.emailNeedsReview,
        department: item.department || "",
        jobTitle: item.jobTitle || "",
      }))}
      roles={roles}
      employeeOptions={employeeOptions}
      graphReady={isEmployeeDirectorySyncConfigured()}
      syncEnabled={isEmployeeDirectorySyncEnabled()}
    />
  );
}
