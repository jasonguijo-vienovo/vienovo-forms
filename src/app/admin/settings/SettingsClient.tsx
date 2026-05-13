"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BellRing,
  Boxes,
  Cog,
  ExternalLink,
  GitBranch,
  KeyRound,
  ListChecks,
  Settings2,
  Users,
} from "lucide-react";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  AdminEmptyState,
  AdminHelpPanel,
  AdminMetricCard,
  AdminPageHeader,
  AdminSection,
  AdminStatusPill,
} from "@/components/admin-ui";
import { AdminFilterTabs, AdminSearchField } from "@/components/admin-ui-client";
import { saveImporterSettings, saveTriggerSettings } from "./actions";

type TriggerRow = {
  id?: string;
  slug: string;
  name: string;
  externalFormUrl: string;
  triggerEnabled: boolean;
  triggerUrl: string;
  triggerSource: string;
  triggerEvent: string;
  triggerFunctionName: string;
  triggerNotes: string;
  detectedTriggerFunctions: string[];
  detectedTriggerEvents: string[];
  readinessState: string;
  lastParsedAt: string;
};

type ViewFilter = "all" | "enabled" | "detected" | "needs_setup";

const SETTINGS_LINKS = [
  {
    href: "/admin/forms",
    title: "Forms registry",
    description: "Visibility, routing, response tabs, and per-form runtime settings.",
    icon: Boxes,
  },
  {
    href: "/admin/notifications",
    title: "Notification flow",
    description: "Email delivery rules, extra recipients, and test sends.",
    icon: BellRing,
  },
  {
    href: "/admin/reimbursement-routing",
    title: "Reimbursement routing",
    description: "Department, location, and cost-center routing rules.",
    icon: GitBranch,
  },
  {
    href: "/admin/lookups",
    title: "Dropdown values",
    description: "Sheet-backed options used by imported and native forms.",
    icon: ListChecks,
  },
  {
    href: "/admin/users",
    title: "User info",
    description: "Employee profiles, sync coverage, and request context.",
    icon: Users,
  },
  {
    href: "/admin/user-roles",
    title: "User roles",
    description: "Admin access control without changing approval routing.",
    icon: KeyRound,
  },
] as const;

export function SettingsClient({
  rows,
  selectedSlug,
  dropdownSourceSheetNames,
}: {
  rows: TriggerRow[];
  selectedSlug?: string;
  dropdownSourceSheetNames: string[];
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewFilter>("all");

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const matchesQuery =
        !query ||
        [row.name, row.slug, row.triggerFunctionName, row.triggerEvent, row.triggerSource]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase());

      if (!matchesQuery) return false;
      if (view === "enabled") return row.triggerEnabled;
      if (view === "detected") return row.detectedTriggerFunctions.length > 0 || row.detectedTriggerEvents.length > 0;
      if (view === "needs_setup") {
        return (row.detectedTriggerFunctions.length > 0 || row.detectedTriggerEvents.length > 0) && !row.triggerEnabled;
      }
      return true;
    });
  }, [query, rows, view]);

  const configuredCount = rows.filter((row) => row.triggerEnabled).length;
  const detectedCount = rows.filter(
    (row) => row.detectedTriggerFunctions.length > 0 || row.detectedTriggerEvents.length > 0,
  ).length;
  const attentionCount = rows.filter(
    (row) => (row.detectedTriggerFunctions.length > 0 || row.detectedTriggerEvents.length > 0) && !row.triggerEnabled,
  ).length;

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="System settings"
        title="Settings"
        description="Use this page as the home for importer defaults, imported-form trigger automation, and the other admin settings surfaces."
        actions={
          <>
            <Link href="/admin/notifications" className="btn-primary">
              <BellRing className="h-4 w-4" />
              Notification settings
            </Link>
            <Link href="/admin/forms" className="btn-secondary">
              <Boxes className="h-4 w-4" />
              Form settings
            </Link>
          </>
        }
      />

      <AdminHelpPanel title="What this page does">
        Importer defaults live here now too. Configure which spreadsheet tabs the auto-detect scan is allowed to use, then manage post-submit trigger automation for imported forms below.
      </AdminHelpPanel>

      <AdminSection
        title="Importer Defaults"
        description="These settings shape how imported Apps Script forms auto-detect spreadsheet-backed dropdown values."
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
          <form action={saveImporterSettings} className="space-y-4 rounded border border-surface-border bg-white p-5">
            <div>
              <h3 className="text-base font-semibold text-surface-text">Dropdown source tabs</h3>
              <p className="mt-1 text-sm text-surface-muted">
                Auto-detect will only scan these sheet tab names when it tries to find dropdown values. Explicit spreadsheet bindings still override this.
              </p>
            </div>
            <Field label="Allowed sheet tab names">
              <textarea
                name="dropdownSourceSheetNames"
                rows={4}
                defaultValue={dropdownSourceSheetNames.join("\n")}
                className="field-input"
              />
            </Field>
            <p className="text-xs text-surface-muted">
              Enter one tab name per line, like <code>Form Dropdowns</code> and <code>Dropdowns</code>.
            </p>
            <div className="flex justify-end">
              <PendingSubmitButton
                type="submit"
                idleLabel={
                  <span className="inline-flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    <span>Save importer settings</span>
                  </span>
                }
                pendingLabel="Saving..."
                className="btn-primary"
              />
            </div>
          </form>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <AdminMetricCard
              label="Imported forms"
              value={rows.length}
              hint="Forms using importer runtime and dropdown sync"
            />
            <AdminMetricCard
              label="Allowed source tabs"
              value={dropdownSourceSheetNames.length}
              tone={dropdownSourceSheetNames.length > 0 ? "ok" : "warn"}
              hint={dropdownSourceSheetNames.join(", ") || "No tab names configured"}
            />
          </div>
        </div>
      </AdminSection>

      <AdminSection
        title="Imported form triggers"
        description="Point the trigger URL to an Apps Script web app or another webhook endpoint. These calls run only for successful in-app imported-form submissions."
        meta={`${filtered.length} of ${rows.length} shown`}
      >
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard label="Imported forms" value={rows.length} hint="Forms that can use trigger automation" />
          <AdminMetricCard label="Triggers enabled" value={configuredCount} tone={configuredCount > 0 ? "ok" : "default"} hint="Will call a configured endpoint on submit" />
          <AdminMetricCard label="Trigger hints detected" value={detectedCount} hint="Apps Script source looked like it had trigger logic" />
          <AdminMetricCard label="Needs setup" value={attentionCount} tone={attentionCount > 0 ? "warn" : "ok"} hint="Detected trigger logic but automation is still off" />
        </div>
        <div className="mb-5 flex flex-col gap-3">
          <AdminSearchField value={query} onChange={setQuery} placeholder="Search by form, trigger event, or function name" />
          <AdminFilterTabs
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "All" },
              { value: "enabled", label: "Enabled" },
              { value: "detected", label: "Detected" },
              { value: "needs_setup", label: "Needs setup" },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <AdminEmptyState title="No imported triggers match these filters" description="Try another search or broaden the filter." />
        ) : (
          <div className="space-y-4">
            {filtered.map((row) => {
              const hasDetectedHints =
                row.detectedTriggerFunctions.length > 0 || row.detectedTriggerEvents.length > 0;
              const active = selectedSlug === row.slug;
              return (
                <article
                  key={row.slug}
                  className={`border bg-white p-5 ${active ? "border-brand-400 ring-1 ring-brand-200" : "border-surface-border"}`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-surface-text">{row.name}</h3>
                        <AdminStatusPill tone={row.triggerEnabled ? "ok" : "neutral"}>
                          {row.triggerEnabled ? "Trigger on" : "Trigger off"}
                        </AdminStatusPill>
                        {hasDetectedHints ? (
                          <AdminStatusPill tone={row.triggerEnabled ? "brand" : "warn"}>
                            source hints detected
                          </AdminStatusPill>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-surface-muted">
                        {row.slug}
                        {row.externalFormUrl ? " • External launch form" : " • In-app imported form"}
                      </p>
                      <p className="mt-2 text-xs text-surface-muted">
                        Last parsed: {row.lastParsedAt ? new Date(row.lastParsedAt).toLocaleString() : "Not recorded"}
                        {row.readinessState ? ` • ${row.readinessState}` : ""}
                      </p>
                    </div>

                    <Link href={`/admin/forms?form=${encodeURIComponent(row.slug)}&settings=open`} className="btn-secondary">
                      <ExternalLink className="h-4 w-4" />
                      Open form settings
                    </Link>
                  </div>

                  {hasDetectedHints ? (
                    <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <p>
                        Detected functions: {row.detectedTriggerFunctions.join(", ") || "None"}
                      </p>
                      <p className="mt-1">
                        Detected events: {row.detectedTriggerEvents.join(", ") || "None"}
                      </p>
                    </div>
                  ) : null}

                  <form action={saveTriggerSettings} className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <input type="hidden" name="id" value={row.id ?? ""} />
                    <input type="hidden" name="slug" value={row.slug} />

                    <label className="flex items-center gap-2 text-sm text-surface-text lg:col-span-2">
                      <input
                        type="checkbox"
                        name="triggerEnabled"
                        defaultChecked={row.triggerEnabled}
                        className="accent-brand-600"
                      />
                      <span>Enable trigger call after successful submit</span>
                    </label>

                    <Field label="Trigger URL">
                      <input
                        name="triggerUrl"
                        type="url"
                        defaultValue={row.triggerUrl}
                        placeholder="https://script.google.com/macros/s/.../exec"
                        className="field-input"
                      />
                    </Field>
                    <Field label="Trigger source">
                      <input
                        name="triggerSource"
                        defaultValue={row.triggerSource}
                        placeholder="apps-script-web-app"
                        className="field-input"
                      />
                    </Field>
                    <Field label="Trigger event">
                      <input
                        name="triggerEvent"
                        defaultValue={row.triggerEvent || "submitted"}
                        placeholder="submitted"
                        className="field-input"
                      />
                    </Field>
                    <Field label="Function name hint">
                      <input
                        name="triggerFunctionName"
                        defaultValue={row.triggerFunctionName || row.detectedTriggerFunctions[0] || ""}
                        placeholder="onFormSubmit"
                        className="field-input"
                      />
                    </Field>
                    <Field label="Notes" className="lg:col-span-2">
                      <textarea
                        name="triggerNotes"
                        rows={3}
                        defaultValue={row.triggerNotes}
                        className="field-input"
                      />
                    </Field>

                    <div className="flex justify-end lg:col-span-2">
                      <PendingSubmitButton
                        type="submit"
                        idleLabel={
                          <span className="inline-flex items-center gap-2">
                            <Cog className="h-4 w-4" />
                            <span>Save trigger settings</span>
                          </span>
                        }
                        pendingLabel="Saving..."
                        className="btn-primary"
                      />
                    </div>
                  </form>
                </article>
              );
            })}
          </div>
        )}
      </AdminSection>

      <AdminSection
        title="Other Settings"
        description="The rest of the configuration surfaces that shape form behavior, people, routing, and communication."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SETTINGS_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="border border-surface-border bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-surface-text">{item.title}</p>
                    <p className="mt-1 text-sm text-surface-muted">{item.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </AdminSection>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-semibold text-surface-text">{label}</label>
      {children}
    </div>
  );
}
