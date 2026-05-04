import { connectMongo } from "@/lib/db/mongo";
import { Employee } from "@/models/Employee";

export async function getEmployeeByEmail(email: string) {
  await connectMongo();
  const doc = await Employee.findOne({ email: email.toLowerCase() }).lean();
  if (!doc) return null;
  return {
    employeeId: doc.employeeId ?? "",
    fullName: doc.fullName ?? "",
    department: doc.department ?? "",
    contactNumber: doc.contactNumber ?? "",
    birthday: doc.birthday ? doc.birthday.toISOString().slice(0, 10) : "",
    supervisorEmail: doc.supervisorEmail ?? "",
    departmentHeadEmail: doc.departmentHeadEmail ?? "",
  };
}
