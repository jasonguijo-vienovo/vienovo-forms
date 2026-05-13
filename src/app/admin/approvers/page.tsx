import { connectMongo } from "@/lib/db/mongo";
import { getAdminEmployeePickerOptions } from "@/lib/employee-admin";
import { isEmployeeDirectorySyncConfigured, isEmployeeDirectorySyncEnabled } from "@/lib/employee-sync";
import { Approver, APPROVER_ROLES } from "@/models/Approver";
import { SystemSetting } from "@/models/SystemSetting";
import { ApproversClient } from "./ApproversClient";

const APPROVER_CUSTOM_ROLES_KEY = "approver-custom-roles";

export default async function ApproversPage() {
  await connectMongo();
  const [all, employeeOptions, storedRoleDoc] = await Promise.all([
    Approver.find({}).sort({ name: 1 }).lean(),
    getAdminEmployeePickerOptions(),
    SystemSetting.findOne({ key: APPROVER_CUSTOM_ROLES_KEY }).lean(),
  ]);
  const dynamicRoles = Array.from(new Set(all.flatMap((item) => item.roles || []).filter(Boolean))).sort();
  const storedRoles = Array.isArray(storedRoleDoc?.value)
    ? Array.from(new Set((storedRoleDoc.value as unknown[]).map((item) => String(item ?? "").trim()).filter(Boolean)))
    : typeof storedRoleDoc?.value === "string"
      ? Array.from(
          new Set(
            storedRoleDoc.value
              .split(/[\n,;]+/g)
              .map((item) => String(item ?? "").trim())
              .filter(Boolean),
          ),
        )
      : [];
  const roles = Array.from(new Set([...APPROVER_ROLES, ...dynamicRoles, ...storedRoles]));

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
