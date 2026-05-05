"use client";

import { useEffect, useState } from "react";
import { FLASH_TOAST_COOKIE, type FlashToast } from "@/lib/flash-shared";

export function SystemToast({ initialToast }: { initialToast: FlashToast | null }) {
  const [toast, setToast] = useState(initialToast);

  useEffect(() => {
    if (!initialToast) return;
    document.cookie = `${FLASH_TOAST_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }, [initialToast]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  const toneClass =
    toast.tone === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div
        className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-sm ${toneClass}`}
      >
        <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-current opacity-75" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {toast.tone === "error" ? "Action failed" : "Success"}
          </p>
          <p className="mt-0.5 text-sm leading-relaxed">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={() => setToast(null)}
          className="rounded-lg px-2 py-1 text-xs font-semibold opacity-70 transition hover:bg-black/5 hover:opacity-100"
          aria-label="Dismiss notification"
        >
          Close
        </button>
      </div>
    </div>
  );
}
