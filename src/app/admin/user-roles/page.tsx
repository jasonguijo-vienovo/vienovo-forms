import { configuredAdminEmails } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { getAdminEmployeePickerOptions } from "@/lib/employee-admin";
import { User } from "@/models/User";
import { UserRolesClient } from "./UserRolesClient";

export default async function UserRolesPage() {
  await connectMongo();
  const [docs, employeeOptions] = await Promise.all([
    User.find({})
      .sort({ role: -1, lastSeenAt: -1, email: 1 })
      .lean(),
    getAdminEmployeePickerOptions(),
  ]);

  const envAdmins = configuredAdminEmails();
  const byEmail = new Map<
    string,
    {
      id?: string;
      email: string;
      name: string;
      role: "user" | "admin";
      isEnvAdmin: boolean;
      firstSeenAt?: string;
      lastSeenAt?: string;
    }
  >();

  for (const doc of docs) {
    byEmail.set(doc.email, {
      id: String(doc._id),
      email: doc.email,
      name: doc.name || "",
      role: doc.role === "admin" ? "admin" : "user",
      isEnvAdmin: envAdmins.has(doc.email),
      firstSeenAt: doc.firstSeenAt ? new Date(doc.firstSeenAt).toISOString() : undefined,
      lastSeenAt: doc.lastSeenAt ? new Date(doc.lastSeenAt).toISOString() : undefined,
    });
  }

  for (const email of envAdmins) {
    const current = byEmail.get(email);
    byEmail.set(email, {
      id: current?.id,
      email,
      name: current?.name || "",
      role: "admin",
      isEnvAdmin: true,
      firstSeenAt: current?.firstSeenAt,
      lastSeenAt: current?.lastSeenAt,
    });
  }

  const users = [...byEmail.values()].sort((a, b) => {
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
    return a.email.localeCompare(b.email);
  });

  return <UserRolesClient users={users} employeeOptions={employeeOptions} />;
}
