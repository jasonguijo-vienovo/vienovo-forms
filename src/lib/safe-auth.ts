import { auth } from "@/auth";

export async function safeAuth() {
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

