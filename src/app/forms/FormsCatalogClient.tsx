"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  Building2,
  ExternalLink,
  FileText,
  Laptop,
  Megaphone,
  Plane,
  ReceiptText,
  Search,
} from "lucide-react";
import Link from "next/link";
import { AdminFilterTabs } from "@/components/admin-ui-client";

type CatalogView = "all" | "ready" | "external" | "coming-soon";

type CatalogForm = {
  slug: string;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  routePath: string;
  externalFormUrl: string;
  runtime: {
    requesterCanOpen: boolean;
  };
};

function getCatalogFormLaunchHref(form: Pick<CatalogForm, "slug" | "routePath" | "externalFormUrl">) {
  return form.externalFormUrl || form.routePath || `/forms/${form.slug}`;
}

function isExternalCatalogFormLaunch(form: Pick<CatalogForm, "externalFormUrl">) {
  return Boolean(String(form.externalFormUrl || "").trim());
}

function formIcon(slug: string) {
  if (slug.includes("travel")) return Plane;
  if (slug.includes("cash")) return Banknote;
  if (slug.includes("reimbursement")) return ReceiptText;
  if (slug.includes("payment")) return Building2;
  if (slug.includes("tell") || slug.includes("help")) return Megaphone;
  if (slug.includes("it")) return Laptop;
  return FileText;
}

export function FormsCatalogClient({ forms }: { forms: CatalogForm[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<CatalogView>("all");

  const filtered = useMemo(() => {
    return forms.filter((form) => {
      const haystack = [form.name, form.slug, form.description].join(" ").toLowerCase();
      if (query && !haystack.includes(query.trim().toLowerCase())) return false;

      if (view === "ready") return form.runtime.requesterCanOpen;
      if (view === "external") return form.runtime.requesterCanOpen && Boolean(form.externalFormUrl);
      if (view === "coming-soon") return !form.runtime.requesterCanOpen;
      return true;
    });
  }, [forms, query, view]);

  const fixedAssetSlugs = useMemo(
    () =>
      new Set([
        "request-for-fixed-asset-item-code",
        "departments-existing-fixed-asset-inventory",
        "fixed-assets-additions-form",
        "employee-assets-accountability-form",
        "fixed-assets-control-log-form",
      ]),
    [],
  );
  const fixedAssetForms = filtered.filter((form) => fixedAssetSlugs.has(form.slug));
  const otherForms = filtered.filter((form) => !fixedAssetSlugs.has(form.slug));

  const readyCount = forms.filter((form) => form.runtime.requesterCanOpen).length;
  const externalCount = forms.filter(
    (form) => form.runtime.requesterCanOpen && Boolean(form.externalFormUrl),
  ).length;
  const comingSoonCount = forms.filter((form) => !form.runtime.requesterCanOpen).length;

  return (
    <>
      <div className="mb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-eyebrow">Request catalog</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-surface-text">Available forms</h1>
            <p className="mt-1 text-sm text-surface-muted">Choose a form and start your request.</p>
          </div>
          <div className="grid gap-2 text-sm text-surface-muted sm:text-right">
            <p>{filtered.length} showing</p>
            <p>{readyCount} ready to open</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border border-surface-border bg-white px-3 py-2.5 text-sm text-surface-muted shadow-sm">
            <Search className="h-4 w-4 shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search forms by name, slug, or keyword"
              className="w-full bg-transparent text-surface-text outline-none placeholder:text-surface-muted"
            />
          </label>
          <AdminFilterTabs
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: `All (${forms.length})` },
              { value: "ready", label: `Ready (${readyCount})` },
              { value: "external", label: `External (${externalCount})` },
              { value: "coming-soon", label: `Coming soon (${comingSoonCount})` },
            ]}
          />
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="space-y-6">
          {fixedAssetForms.length > 0 ? (
            <section>
              <div className="mb-3">
                <h2 className="text-base font-semibold text-surface-text">Fixed Assets Forms</h2>
                <p className="text-sm text-surface-muted">Dedicated forms for Fixed Assets requests and logs.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {fixedAssetForms.map((form) => (
                  <FormCard key={form.slug} {...form} />
                ))}
              </div>
            </section>
          ) : null}
          {otherForms.length > 0 ? (
            <section>
              {fixedAssetForms.length > 0 ? (
                <div className="mb-3">
                  <h2 className="text-base font-semibold text-surface-text">Other Forms</h2>
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {otherForms.map((form) => (
                  <FormCard key={form.slug} {...form} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="app-panel p-10 text-center text-sm text-surface-muted">
          No forms match this search yet.
        </div>
      )}
    </>
  );
}

function FormCard({
  slug,
  name,
  description,
  status,
  externalFormUrl,
  routePath,
  runtime,
}: Pick<
  CatalogForm,
  "slug" | "name" | "description" | "status" | "externalFormUrl" | "routePath" | "runtime"
>) {
  const available = runtime.requesterCanOpen;
  const Icon = formIcon(slug);
  const badgeText = status !== "published" ? "Pending" : "Coming soon";
  const href = getCatalogFormLaunchHref({ slug, routePath, externalFormUrl });
  const isExternal = isExternalCatalogFormLaunch({ externalFormUrl });

  const inner = (
    <div
      className={`app-panel group flex h-full min-h-[150px] flex-col justify-between p-5 transition ${
        available ? "hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm" : "opacity-60"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-brand-50 text-brand-700 ring-1 ring-brand-100">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-surface-text">{name}</h2>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-surface-muted">{description}</p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        {available ? (
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700">
            <span>Start request</span>
            {isExternal ? <ExternalLink className="h-4 w-4" /> : null}
          </span>
        ) : (
          <span className="status-pill border-surface-border bg-slate-50 text-surface-muted">{badgeText}</span>
        )}
        {available ? (
          <ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-brand-700" />
        ) : null}
      </div>
    </div>
  );

  if (!available) return inner;
  return isExternal ? (
    <a href={href} className="block">
      {inner}
    </a>
  ) : (
    <Link href={href}>{inner}</Link>
  );
}
