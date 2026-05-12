import { connectMongo } from "@/lib/db/mongo";
import { getAdminEmployeePickerOptions } from "@/lib/employee-admin";
import { Approver, APPROVER_ROLES } from "@/models/Approver";
import { ApproversClient } from "./ApproversClient";

export default async function ApproversPage() {
  await connectMongo();
  const [all, employeeOptions] = await Promise.all([
    Approver.find({}).sort({ name: 1 }).lean(),
    getAdminEmployeePickerOptions(),
  ]);

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
      roles={[...APPROVER_ROLES]}
      employeeOptions={employeeOptions}
    />
  );
}
