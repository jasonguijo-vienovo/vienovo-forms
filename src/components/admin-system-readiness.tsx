import { ChevronDown, CircleCheckBig, CircleDashed } from "lucide-react";
import { AdminStatusPill } from "@/components/admin-ui";
import { cn } from "@/lib/utils";
import type { SystemReadinessSnapshot } from "@/lib/system-readiness";

export function AdminSystemReadiness({
  readiness,
  title = "System readiness",
  description = "Open this to verify which connected services are ready before testing workflows.",
}: {
  readiness: SystemReadinessSnapshot;
  title?: string;
  description?: string;
}) {
  return (
    <details className="admin-panel overflow-hidden">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-surface-text">{title}</h2>
          <p className="mt-1 text-sm text-surface-muted">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <AdminStatusPill tone={readiness.readyCount === readiness.totalCount ? "ok" : "warn"}>
            {readiness.readyCount} of {readiness.totalCount} ready
          </AdminStatusPill>
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-surface-muted" />
        </div>
      </summary>

      <div className="border-t border-surface-border px-5 py-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {readiness.items.map((item) => {
            const Icon = item.ready ? CircleCheckBig : CircleDashed;
            return (
              <div key={item.key} className="border border-surface-border bg-white p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5",
                      item.ready ? "text-brand-700" : "text-amber-700",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-surface-text">{item.label}</p>
                      <AdminStatusPill tone={item.ready ? "ok" : "warn"}>
                        {item.ready ? "Ready" : "Needs setup"}
                      </AdminStatusPill>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-surface-muted">{item.detail}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}
