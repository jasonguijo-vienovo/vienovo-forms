"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SeedResult = {
  ok: boolean;
  added?: Record<string, number>;
  error?: string;
};

export function SeedButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/seed", { method: "POST" });
      const data = (await res.json()) as SeedResult;
      setResult(data);
      router.refresh();
    } catch (err) {
      setResult({ ok: false, error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={loading}
        className="bg-gradient-to-br from-brand-600 to-brand-700 text-white font-semibold px-5 py-2 rounded-lg shadow-md hover:opacity-95 active:scale-[0.99] transition disabled:opacity-50 text-sm"
      >
        {loading ? "Seeding…" : "Run seed"}
      </button>

      {result?.ok && result.added && (
        <div className="mt-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          <p className="font-semibold mb-1">Done.</p>
          <ul className="text-xs space-y-0.5">
            {Object.entries(result.added).map(([k, v]) => (
              <li key={k}>
                <span className="font-mono">{k}</span>: +{v} added
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && !result.ok && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          Seed failed: {result.error ?? "unknown error"}
        </div>
      )}
    </div>
  );
}
