"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-surface-text">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-surface-muted">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminHelpPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="admin-panel border-l-4 border-l-brand-700 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-brand-700">
          <Info className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-surface-text">{title}</h2>
          <div className="mt-1 text-sm leading-6 text-surface-muted">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function AdminSection({
  title,
  description,
  meta,
  children,
}: {
  title: string;
  description?: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="admin-panel overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-surface-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-surface-text">{title}</h2>
          {description ? <p className="mt-1 text-sm text-surface-muted">{description}</p> : null}
        </div>
        {meta ? <div className="text-sm text-surface-muted">{meta}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function AdminMetricCard({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "ok" | "warn";
  hint?: string;
}) {
  const valueClass =
    tone === "ok"
      ? "text-brand-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-surface-text";

  return (
    <div className="admin-panel p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">{label}</p>
      <p className={cn("mt-2 text-3xl font-semibold", valueClass)}>{value}</p>
      {hint ? <p className="mt-2 text-xs text-surface-muted">{hint}</p> : null}
    </div>
  );
}

export function AdminEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border border-dashed border-surface-border bg-slate-50 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-surface-text">{title}</p>
      <p className="mt-1 text-sm text-surface-muted">{description}</p>
    </div>
  );
}

export function AdminStatusPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "brand";
}) {
  const toneClass =
    tone === "ok"
      ? "border-green-200 bg-green-50 text-green-800"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "danger"
          ? "border-red-200 bg-red-50 text-red-800"
          : tone === "brand"
            ? "border-brand-100 bg-brand-50 text-brand-700"
            : "border-surface-border bg-slate-50 text-surface-muted";

  return <span className={cn("status-pill uppercase", toneClass)}>{children}</span>;
}
