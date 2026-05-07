"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DuplicateModal({ slug }: { slug: string }) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);

  return (
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center px-4 backdrop-blur-sm transition-opacity duration-200 ${
        closing ? "bg-slate-950/0 opacity-0" : "bg-slate-950/45 opacity-100"
      }`}
    >
      <div
        className={`w-full max-w-md rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-900 shadow-2xl transition-all duration-200 ${
          closing ? "translate-y-1 scale-[0.98]" : "translate-y-0 scale-100"
        }`}
      >
        <p className="text-sm font-semibold">Action failed</p>
        <p className="mt-1 text-sm leading-relaxed">
          Duplicate/Already exists: this employee information is already on file (First Name, Employee ID, or Email).
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setClosing(true);
              window.setTimeout(() => router.push(`/forms/${slug}`), 180);
            }}
            className="rounded-xl border border-current/20 px-4 py-2 text-sm font-semibold transition hover:bg-black/5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

