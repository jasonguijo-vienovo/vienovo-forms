import { connectMongo } from "@/lib/db/mongo";
import { safeAuth } from "@/lib/safe-auth";
import { User, type AppUserRole } from "@/models/User";

function isDevBypassAdmin(email: string | null | undefined): boolean {
  if (process.env.AUTH_DEV_BYPASS !== "1") return false;
  return Boolean(email?.toLowerCase().endsWith("@vienovo.ph"));
}

export function configuredAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  if (isDevBypassAdmin(email)) return true;
  return configuredAdminEmails().has(email.toLowerCase());
}

export async function getEffectiveUserRole(
  email: string | null | undefined,
): Promise<AppUserRole> {
  if (!email) return "user";
  if (isAdminEmail(email)) return "admin";

  try {
    await connectMongo();
    const user = await User.findOne({ email: email.toLowerCase() })
      .select({ role: 1 })
      .lean();
    return user?.role === "admin" ? "admin" : "user";
  } catch (error) {
    console.error("getEffectiveUserRole fallback:", error);
    return "user";
  }
}

export async function isAdminUser(email: string | null | undefined) {
  return (await getEffectiveUserRole(email)) === "admin";
}

export async function requireAdmin() {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!(await isAdminUser(email))) {
    throw new Error("Forbidden: admin access required");
  }
  return { session: session!, email: email!.toLowerCase() };
}

export async function getAdminSession() {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  return { session, email, isAdmin: await isAdminUser(email) };
}
