import { connectMongo } from "@/lib/db/mongo";
import { Employee } from "@/models/Employee";

function normalizeEmail(email: string) {
  return String(email ?? "").trim().toLowerCase();
}

export async function getEmployeeByEmail(email: string) {
  await connectMongo();
  const doc = await Employee.findOne({ email: normalizeEmail(email) }).lean();
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

export async function isKnownVienovoEmployee(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail.endsWith("@vienovo.ph")) return false;

  await connectMongo();
  return Boolean(await Employee.exists({ email: normalizedEmail, isActive: true }));
}
