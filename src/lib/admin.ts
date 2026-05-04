import { safeAuth } from "@/lib/safe-auth";

function isDevBypassAdmin(email: string | null | undefined): boolean {
  if (process.env.AUTH_DEV_BYPASS !== "1") return false;
  return Boolean(email?.toLowerCase().endsWith("@vienovo.ph"));
}

function adminEmails(): Set<string> {
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
  return adminEmails().has(email.toLowerCase());
}

export async function requireAdmin() {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!isAdminEmail(email)) {
    throw new Error("Forbidden: admin access required");
  }
  return { session: session!, email: email!.toLowerCase() };
}

export async function getAdminSession() {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  return { session, email, isAdmin: isAdminEmail(email) };
}
