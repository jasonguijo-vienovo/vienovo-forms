import type { Session } from "next-auth";
import { cookies } from "next/headers";

const SCREENSHOT_BYPASS_COOKIE = "vienovo_screenshot_bypass";

function configuredAdminEmails() {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function screenshotBypassEnabled() {
  return process.env.LOCAL_SCREENSHOT_BYPASS === "1";
}

export async function getScreenshotBypassSession(): Promise<Session | null> {
  if (!screenshotBypassEnabled()) return null;

  const cookieStore = await cookies();
  const bypassEnabled = cookieStore.get(SCREENSHOT_BYPASS_COOKIE)?.value === "1";
  if (!bypassEnabled) return null;

  const adminEmails = configuredAdminEmails();
  const email = adminEmails[0] ?? "screenshot-admin@vienovo.local";

  return {
    expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    user: {
      id: "local-screenshot-admin",
      name: "Screenshot Admin",
      email,
      role: "admin",
      isEmployee: true,
    },
  } as Session;
}

export { SCREENSHOT_BYPASS_COOKIE };
