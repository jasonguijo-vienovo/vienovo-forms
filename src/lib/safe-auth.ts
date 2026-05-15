import { auth } from "@/auth";
import { getScreenshotBypassSession } from "@/lib/screenshot-bypass";

export async function safeAuth() {
  const bypassSession = await getScreenshotBypassSession();
  if (bypassSession) {
    return bypassSession;
  }

  try {
    return await auth();
  } catch (e) {
    if (
      typeof e === "object" &&
      e !== null &&
      "digest" in e &&
      (e as { digest?: string }).digest === "DYNAMIC_SERVER_USAGE"
    ) {
      throw e;
    }

    console.error("Auth error:", e);
    return null;
  }
}

