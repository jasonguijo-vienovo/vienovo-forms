"use client";

import { useState } from "react";
import { BellRing, RotateCcw, Save, Send } from "lucide-react";
import { AdminSystemReadiness } from "@/components/admin-system-readiness";
import { PendingFormState } from "@/components/pending-form-state";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  AdminEmptyState,
  AdminHelpPanel,
  AdminPageHeader,
  AdminSection,
  AdminStatusPill,
} from "@/components/admin-ui";
import { AdminFilterTabs, AdminSearchField } from "@/components/admin-ui-client";
import type { SystemReadinessSnapshot } from "@/lib/system-readiness";
import { enableEmployeeInformationDefaults, resetNotificationFlow, saveNotificationFlow, sendNotificationTestEmail } from "./actions";

type Flow = {
  formSlug: string;
  formName: string;
  isActive: boolean;
  notifyOnSubmit: boolean;
  notifyNextApprover: boolean;
  notifySubmitterOnApproved: boolean;
  notifySubmitterOnRejected: boolean;
  extraRecipients: string[];
  notes: string;
};

type ViewFilter = "all" | "active" | "off";

export function NotificationsClient({
  flows,
  readiness,
  recentFailures,
}: {
  flows: Flow[];
  readiness: SystemReadinessSnapshot;
  recentFailures: Array<{
    id: string;
    formName: string;
    formSlug: string;
    recipient: string;
    subject: string;
    error: string;
    sentAt: string;
  }>;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewFilter>("all");
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);

  const filtered = flows.filter((flow) => {
    const matchesQuery =
      !query ||
      [flow.formName, flow.formSlug].join(" ").toLowerCase().includes(query.toLowerCase());
    if (!matchesQuery) return false;
    if (view === "active") return flow.isActive;
    if (view === "off") return !flow.isActive;
    return true;
  });
  const visible = filtered.slice(0, visibleCount);

  const activeCount = flows.filter((flow) => flow.isActive).length;
  const offCount = flows.length - activeCount;
  const healthy = readiness.readyCount === readiness.totalCount;

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Email control"
        title="Notification flow"
        description="Control who gets emailed and when, without changing request routing, approvals, or storage."
        actions={
          <form action={enableEmployeeInformationDefaults}>
            <PendingSubmitButton type="submit" idleLabel="Enable Employee Info Defaults" pendingLabel="Applying..." className="btn-primary" />
          </form>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CompactMetricCard label="Total forms" value={flows.length} />
          <CompactMetricCard label="Notifications on" value={activeCount} tone="ok" />
          <CompactMetricCard label="Notifications off" value={offCount} tone="warn" />
          <CompactMetricCard label="Visible now" value={filtered.length} />
          <CompactMetricCard label="Flow health" value={healthy ? "Healthy" : "Needs attention"} tone={healthy ? "ok" : "warn"} />
          <CompactMetricCard
            label="Recent failures"
            value={recentFailures.length}
            tone={recentFailures.length > 0 ? "warn" : "ok"}
          />
        </div>
        <AdminHelpPanel title="What this page does">
          Default recipients still come from the form logic. This page only turns those emails on or off
          and lets you add extra recipients for each form. Recent delivery failures below help us spot
          broken recipient or SMTP issues before users report them.
        </AdminHelpPanel>
      </div>

      <AdminSystemReadiness
        readiness={readiness}
        description="Open this to see whether SMTP, Google integrations, auth, and the current database connection are ready before testing notification flow."
      />

      <AdminSection
        title="SMTP test email"
        description="Send a real test email using the current deployment settings before testing live form notifications."
      >
        <div className="rounded-md border border-surface-border bg-slate-50 p-3">
          <p className="mb-2 text-xs text-surface-muted">
            Quick check before go-live. Leave blank to send to your current admin email.
          </p>
          <form action={sendNotificationTestEmail} className="w-full">
            <PendingFormState className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="email"
                name="testEmail"
                placeholder="email@vienovo.ph"
                className="field-input flex-1"
              />
              <PendingSubmitButton
                type="submit"
                idleLabel={
                  <span className="inline-flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    <span>Send test</span>
                  </span>
                }
                pendingLabel="Sending..."
                className="btn-primary sm:min-w-[140px]"
              />
            </PendingFormState>
          </form>
        </div>
      </AdminSection>

      <AdminSection
        title="Recent delivery failures"
        description="The latest failed notification attempts so we can diagnose recipient or SMTP issues quickly."
        meta={`${recentFailures.length} recent failure${recentFailures.length === 1 ? "" : "s"}`}
      >
        {recentFailures.length === 0 ? (
          <AdminEmptyState
            title="No failed deliveries recently"
            description="Notification delivery looks healthy from the latest recorded attempts."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {recentFailures.map((failure) => (
              <div key={failure.id} className="rounded border border-surface-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-surface-text">{failure.formName}</p>
                    <p className="mt-1 text-xs text-surface-muted">
                      {failure.recipient || "Unknown recipient"} · {formatRelativeDate(failure.sentAt)}
                    </p>
                  </div>
                  <AdminStatusPill tone="danger">failed</AdminStatusPill>
                </div>
                <p className="mt-3 text-xs text-surface-muted">{failure.subject || "No subject recorded"}</p>
                <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {failure.error || "Unknown notification failure"}
                </p>
              </div>
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection
        title="Per-form notification settings"
        description="Search forms and keep the notification settings compact and readable."
        meta={`${filtered.length} of ${flows.length} shown`}
      >
        <div className="mb-5 flex flex-col gap-3">
          <AdminSearchField value={query} onChange={setQuery} placeholder="Search by form name or form ID" />
          <AdminFilterTabs
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "All forms" },
              { value: "active", label: "Notifications on" },
              { value: "off", label: "Notifications off" },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <AdminEmptyState
            title="No forms match these filters"
            description="Try another search or switch back to a broader filter."
          />
        ) : (
          <div className="grid gap-3">
            {visible.map((flow) => (
              <section key={flow.formSlug} className="border border-surface-border bg-white p-5">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="rounded bg-brand-50 p-2 text-brand-700">
                        <BellRing className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-surface-text">{flow.formName}</h3>
                        <p className="text-xs text-surface-muted">
                          Form ID: <code>{flow.formSlug}</code>
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-surface-muted">
                      Extra recipients are added to the same email. They do not replace the built-in
                      recipients from the form flow.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <AdminStatusPill tone={flow.isActive ? "ok" : "neutral"}>
                      {flow.isActive ? "Notifications on" : "Notifications off"}
                    </AdminStatusPill>
                    <form action={resetNotificationFlow}>
                      <input type="hidden" name="formSlug" value={flow.formSlug} />
                      <input type="hidden" name="formName" value={flow.formName} />
                      <PendingSubmitButton
                        type="submit"
                        idleLabel={
                          <span className="inline-flex items-center gap-2">
                            <RotateCcw className="h-4 w-4" />
                            <span>Reset</span>
                          </span>
                        }
                        pendingLabel="Resetting..."
                        className="btn-secondary"
                      />
                    </form>
                    {editingSlug === flow.formSlug ? (
                      <button
                        type="button"
                        onClick={() => setEditingSlug(null)}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingSlug(flow.formSlug)}
                        className="btn-secondary"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                <form action={saveNotificationFlow} className="mt-4">
                  <PendingFormState className="space-y-4">
                    <input type="hidden" name="formSlug" value={flow.formSlug} />
                    <input type="hidden" name="formName" value={flow.formName} />

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <ToggleField name="isActive" defaultChecked={flow.isActive} disabled={editingSlug !== flow.formSlug} label="Notifications active" description="Master switch for this form." />
                      <ToggleField name="notifyOnSubmit" defaultChecked={flow.notifyOnSubmit} disabled={editingSlug !== flow.formSlug} label="When submitted" description="Email after submit or resubmit." />
                      <ToggleField name="notifyNextApprover" defaultChecked={flow.notifyNextApprover} disabled={editingSlug !== flow.formSlug} label="Next approver" description="Email the next approver in line." />
                      <ToggleField name="notifySubmitterOnApproved" defaultChecked={flow.notifySubmitterOnApproved} disabled={editingSlug !== flow.formSlug} label="When fully approved" description="Tell the requester the process is done." />
                      <ToggleField name="notifySubmitterOnRejected" defaultChecked={flow.notifySubmitterOnRejected} disabled={editingSlug !== flow.formSlug} label="When rejected" description="Tell the requester the request was rejected." />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-surface-text">Extra recipients</label>
                        <textarea
                          name="extraRecipients"
                          rows={4}
                          defaultValue={flow.extraRecipients.join(", ")}
                          placeholder="finance@vienovo.ph, audit@vienovo.ph"
                          readOnly={editingSlug !== flow.formSlug}
                          disabled={editingSlug !== flow.formSlug}
                          className="field-input"
                        />
                        <p className="mt-1 text-xs text-surface-muted">
                          Use commas, semicolons, or new lines.
                        </p>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-surface-text">Notes</label>
                        <textarea
                          name="notes"
                          rows={4}
                          defaultValue={flow.notes}
                          placeholder="Example: Keep accounting informed after rollout."
                          readOnly={editingSlug !== flow.formSlug}
                          disabled={editingSlug !== flow.formSlug}
                          className="field-input"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      {editingSlug === flow.formSlug ? (
                        <PendingSubmitButton
                          type="submit"
                          idleLabel={
                            <span className="inline-flex items-center gap-2">
                              <Save className="h-4 w-4" />
                              <span>Save notification flow</span>
                            </span>
                          }
                          pendingLabel="Saving..."
                          className="btn-primary"
                        />
                      ) : null}
                    </div>
                  </PendingFormState>
                </form>
              </section>
            ))}
            {filtered.length > visibleCount ? (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + 12)}
                className="btn-secondary"
              >
                Load more settings ({filtered.length - visibleCount} remaining)
              </button>
            ) : null}
          </div>
        )}
      </AdminSection>
    </div>
  );
}

function ToggleField({
  name,
  label,
  description,
  defaultChecked,
  disabled = false,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="border border-surface-border bg-slate-50 p-4">
      <span className="flex items-start gap-3">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="mt-1 accent-brand-600" />
        <span>
          <span className="block text-sm font-semibold text-surface-text">{label}</span>
          <span className="mt-1 block text-xs text-surface-muted">{description}</span>
        </span>
      </span>
    </label>
  );
}

function CompactMetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "ok" | "warn";
}) {
  const valueClass =
    tone === "ok" ? "text-brand-700" : tone === "warn" ? "text-amber-700" : "text-surface-text";

  return (
    <div className="admin-panel px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-surface-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold leading-none ${valueClass}`}>{value}</p>
    </div>
  );
}

function formatRelativeDate(value: string) {
  if (!value) return "Not recorded";
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
