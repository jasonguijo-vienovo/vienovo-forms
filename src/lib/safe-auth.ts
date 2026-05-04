import { auth } from "@/auth";

export async function safeAuth() {
  try {
    return await auth();
  } catch (e) {
    console.error("Auth error:", e);
    return null;
  }
}

