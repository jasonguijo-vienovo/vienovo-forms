"use client";

import { useEffect, useState } from "react";
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
    persistent: Boolean((input as { persistent?: unknown }).persistent),
  };
}

function clearFlashCookie() {
  document.cookie = `${FLASH_TOAST_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

function readFlashCookie() {
  const prefix = `${FLASH_TOAST_COOKIE}=`;
  const raw = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);

  if (!raw) return null;

  try {
    return normalizeToast(JSON.parse(decodeURIComponent(raw)));
  } catch {
    return null;
  }
}

export function SystemToast({ initialToast }: { initialToast: FlashToast | null }) {
  const [toast, setToast] = useState(initialToast);
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [visible, setVisible] = useState(Boolean(initialToast));

  useEffect(() => {
    if (!initialToast) return;
    clearFlashCookie();
  }, [initialToast]);

  useEffect(() => {
    function showFlashCookie() {
      const nextToast = readFlashCookie();
      if (!nextToast) return;
      setToast(nextToast);
      setVisible(false);
      window.requestAnimationFrame(() => setVisible(true));
      clearFlashCookie();
    }

    showFlashCookie();
    const timer = window.setInterval(showFlashCookie, 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    if (toast.persistent) return;
    setSecondsLeft(5);
    const dismissTimer = window.setTimeout(() => {
      setVisible(false);
      window.setTimeout(() => setToast(null), 220);
    }, 5000);
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
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div
        className={[
          "pointer-events-auto w-full max-w-md rounded-2xl border px-5 py-4 shadow-2xl transition-all duration-200 ease-out",
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0",
          toneClass,
        ].join(" ")}
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
            onClick={() => {
              setVisible(false);
              window.setTimeout(() => setToast(null), 180);
            }}
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
