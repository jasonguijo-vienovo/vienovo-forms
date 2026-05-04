"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SeedResult = {
  ok: boolean;
  added?: Record<string, number>;
  error?: string;
  warnings?: string[];
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
        {loading ? "Running seed..." : "Run seed"}
      </button>

      <p className="mt-2 text-xs text-surface-muted">
        This loads built-in dropdowns, approvers, reimbursement routing, and imported-form sync data
        in one pass.
      </p>

      {result?.ok && result.added && (
        <div className="mt-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          <p className="font-semibold mb-1">Seed finished.</p>
          <ul className="text-xs space-y-0.5">
            {Object.entries(result.added).map(([k, v]) => (
              <li key={k}>
                <span className="font-mono">{k}</span>: +{String(v)} added
              </li>
            ))}
          </ul>
        </div>
      )}

      {result?.ok && result.warnings && result.warnings.length > 0 ? (
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold mb-1">Seed finished with imported-form warnings.</p>
          <ul className="text-xs space-y-0.5">
            {result.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result && !result.ok && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          Seed failed: {result.error ?? "unknown error"}
        </div>
      )}
    </div>
  );
}
