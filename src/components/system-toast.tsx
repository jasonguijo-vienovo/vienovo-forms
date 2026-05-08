"use client";

import { useEffect, useState } from "react";
import { FLASH_TOAST_COOKIE, type FlashToast } from "@/lib/flash-shared";

export function SystemToast({ initialToast }: { initialToast: FlashToast | null }) {
  const [toast, setToast] = useState(initialToast);
  const [secondsLeft, setSecondsLeft] = useState(5);

  useEffect(() => {
    if (!initialToast) return;
    document.cookie = `${FLASH_TOAST_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }, [initialToast]);

  useEffect(() => {
    if (!toast) return;
    if (toast.persistent) return;
    setSecondsLeft(5);
    const dismissTimer = window.setTimeout(() => setToast(null), 5000);
    const countdownTimer = window.setInterval(() => {
      setSecondsLeft((current) => (current > 1 ? current - 1 : 1));
    }, 1000);
    return () => {
      window.clearTimeout(dismissTimer);
      window.clearInterval(countdownTimer);
    };
  }, [toast]);

  if (!toast) return null;

  const toneClass =
    toast.tone === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
      <div
        className={`w-full max-w-md rounded-2xl border px-5 py-4 shadow-2xl ${toneClass}`}
        role="alertdialog"
        aria-live="polite"
        aria-modal="false"
      >
        <div className="flex items-start gap-3">
          <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-current opacity-75" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {toast.tone === "error" ? "Action failed" : "Success"}
            </p>
            <p className="mt-1 text-sm leading-relaxed">{toast.message}</p>
            {!toast.persistent ? (
              <p className="mt-3 text-xs opacity-70">
                Closing automatically in {secondsLeft} second{secondsLeft === 1 ? "" : "s"}.
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setToast(null)}
            className="rounded-xl border border-current/20 px-4 py-2 text-sm font-semibold transition hover:bg-black/5"
            aria-label="Okay"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
