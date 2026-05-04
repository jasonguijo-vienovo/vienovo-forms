import { cookies } from "next/headers";
import { FLASH_TOAST_COOKIE, type FlashToast } from "@/lib/flash-shared";

function normalizeToast(input: unknown): FlashToast | null {
  if (!input || typeof input !== "object") return null;
  const tone = (input as { tone?: unknown }).tone;
  const message = (input as { message?: unknown }).message;
  if ((tone !== "success" && tone !== "error") || typeof message !== "string" || !message.trim()) {
    return null;
  }
  return {
    tone,
    message: message.trim().slice(0, 240),
  };
}

export async function setFlashToast(toast: FlashToast) {
  const cookieStore = await cookies();
  cookieStore.set(FLASH_TOAST_COOKIE, JSON.stringify(toast), {
    path: "/",
    maxAge: 20,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function readFlashToast(): Promise<FlashToast | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(FLASH_TOAST_COOKIE)?.value;
  if (!raw) return null;

  try {
    return normalizeToast(JSON.parse(raw));
  } catch {
    return null;
  }
}
