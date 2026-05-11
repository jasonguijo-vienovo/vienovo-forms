import { connectMongo } from "@/lib/db/mongo";
import { getAdminEmployeePickerOptions } from "@/lib/employee-admin";
import { Approver } from "@/models/Approver";
import { ProcessorsClient } from "./ProcessorsClient";

export default async function ProcessorsPage() {
  await connectMongo();
  const [processors, employeeOptions] = await Promise.all([
    Approver.find({ roles: "processor" }).sort({ name: 1 }).lean(),
    getAdminEmployeePickerOptions(),
  ]);

  return (
    <ProcessorsClient
      processors={processors.map((item) => ({
        _id: String(item._id),
        name: item.name,
        email: item.email,
        isActive: item.isActive,
        emailNeedsReview: item.emailNeedsReview,
        department: item.department || "",
      }))}
      employeeOptions={employeeOptions}
    />
  );
}
