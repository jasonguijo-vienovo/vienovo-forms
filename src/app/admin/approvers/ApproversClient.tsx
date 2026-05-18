"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  AdminEmptyState,
  AdminHelpPanel,
  AdminPageHeader,
  AdminSection,
  AdminStatusPill,
} from "@/components/admin-ui";
import { AdminFilterTabs, AdminSearchField } from "@/components/admin-ui-client";
import { SearchableSelect } from "@/components/searchable-select";
import {
  addApprover,
  addApproverRole,
  applyApproverBatchAction,
  deleteApprover,
  deleteApproverRole,
  editApproverRole,
  recoverApproverEmails,
  syncLookupDropdownsFromApprovers,
  syncApproversFromIntune,
  toggleApprover,
  updateApprover,
  updateProcessorAssignments,
} from "./actions";

type ApproverRow = {
  _id: string;
  name: string;
  email: string;
  employeeId: string;
  roles: string[];
  isActive: boolean;
  emailNeedsReview: boolean;
  department?: string;
  jobTitle?: string;
};

type EmployeeOption = {
  email: string;
  fullName: string;
  employeeId: string;
  department: string;
  jobTitle: string;
  isActive: boolean;
};

type ProcessorRoutingForm = {
  slug: string;
  name: string;
  processorApproverId: string;
  processorApproverName: string;
  processorApproverEmail: string;
};

type ViewFilter = "all" | "review" | "active" | "inactive" | "hr_missing_email";

const ROLE_PRESETS = [
  { label: "Immediate Superior + Department Head", roles: ["supervisor", "head"] },
  { label: "Processor", roles: ["processor"] },
  { label: "CEO", roles: ["ceo"] },
];

const ROLE_TONE: Record<string, string> = {
  supervisor: "border-blue-200 bg-blue-50 text-blue-700",
  head: "border-indigo-200 bg-indigo-50 text-indigo-700",
  sla: "border-cyan-200 bg-cyan-50 text-cyan-700",
  cashadvanceapprover: "border-emerald-200 bg-emerald-50 text-emerald-700",
  processor: "border-violet-200 bg-violet-50 text-violet-700",
  hr: "border-pink-200 bg-pink-50 text-pink-700",
  ceo: "border-rose-200 bg-rose-50 text-rose-700",
  approver: "border-slate-200 bg-slate-50 text-slate-700",
};

function formatSyncDateTime(value: string) {
  if (!value) return "Not synced yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid timestamp";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleLabel(role: string) {
  if (role === "supervisor") return "Immediate Superior";
  if (role === "head") return "Department Head";
  if (role === "sla") return "SLA Approver";
  if (role === "cashAdvanceApprover") return "Cash Advance Approver";
  if (role === "processor") return "Processor";
  if (role === "hr") return "HR";
  if (role === "ceo") return "CEO";
  return role;
}

function roleChipLabel(role: string) {
  if (role === "supervisor") return "Immediate Superior";
  if (role === "head") return "Dept Head";
  if (role === "sla") return "SLA";
  if (role === "cashAdvanceApprover") return "CA Approver";
  if (role === "processor") return "Processor";
  if (role === "hr") return "HR";
  if (role === "ceo") return "CEO";
  return role;
}

function formatProcessorAssignmentCount(count: number) {
  return `${count} processor form${count === 1 ? "" : "s"}`;
}

function uniqueVisibleRoles(roles: string[], allowedRoles: string[]) {
  const allowed = new Set(allowedRoles);
  return Array.from(new Set(roles.filter((role) => allowed.has(role))));
}

export function ApproversClient({
  approvers,
  roles,
  employeeOptions,
  graphReady,
  syncEnabled,
  lastLookupDropdownSyncAt,
  processorForms,
}: {
  approvers: ApproverRow[];
  roles: string[];
  employeeOptions: EmployeeOption[];
  graphReady: boolean;
  syncEnabled: boolean;
  lastLookupDropdownSyncAt: string;
  processorForms: ProcessorRoutingForm[];
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewFilter>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [showRoleManagement, setShowRoleManagement] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [showApproverList, setShowApproverList] = useState(true);
  const [selectedEmployeeEmail, setSelectedEmployeeEmail] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [selectedRolesForAdd, setSelectedRolesForAdd] = useState<string[]>([]);
  const [editRoleSelections, setEditRoleSelections] = useState<Record<string, string[]>>({});
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>([]);
  const [batchRole, setBatchRole] = useState("");
  const [processorEditorId, setProcessorEditorId] = useState<string | null>(null);
  const [processorQuery, setProcessorQuery] = useState("");
  const visibleRoles = useMemo(() => roles, [roles]);

  const selectedEmployee = useMemo(
    () => employeeOptions.find((employee) => employee.email === selectedEmployeeEmail) ?? null,
    [employeeOptions, selectedEmployeeEmail],
  );

  const employeeSelectOptions = useMemo(
    () =>
      employeeOptions
        .filter((employee) => employee.isActive)
        .map((employee) => ({
          value: employee.email,
          label:
            `${employee.fullName} - ${employee.email}` +
            `${employee.department ? ` - ${employee.department}` : ""}` +
            `${employee.employeeId ? ` - ${employee.employeeId}` : ""}`,
        })),
    [employeeOptions],
  );

  const processorFormsByApproverId = useMemo(() => {
    const out = new Map<string, ProcessorRoutingForm[]>();
    for (const form of processorForms) {
      const approverId = String(form.processorApproverId ?? "").trim();
      if (!approverId) continue;
      const list = out.get(approverId) ?? [];
      list.push(form);
      out.set(approverId, list);
    }
    return out;
  }, [processorForms]);

  const filtered = approvers.filter((approver) => {
    const matchesQuery =
      !query ||
      [approver.name, approver.email, approver.roles.join(" "), approver.department ?? "", approver.jobTitle ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());

    if (!matchesQuery) return false;
    if (roleFilter !== "all" && !approver.roles.includes(roleFilter)) return false;
    if (view === "review") return approver.emailNeedsReview;
    if (view === "active") return approver.isActive;
    if (view === "inactive") return !approver.isActive;
    if (view === "hr_missing_email") {
      return approver.roles.includes("hr") && (!approver.email || approver.emailNeedsReview);
    }
    return true;
  });

  const processorEditorApprover = useMemo(
    () => approvers.find((approver) => approver._id === processorEditorId) ?? null,
    [approvers, processorEditorId],
  );

  const processorEditorForms = useMemo(() => {
    if (!processorEditorApprover) return [];
    const lowerQuery = processorQuery.trim().toLowerCase();
    return [...processorForms]
      .filter((form) => {
        if (!lowerQuery) return true;
        return [form.name, form.slug, form.processorApproverName, form.processorApproverEmail]
          .join(" ")
          .toLowerCase()
          .includes(lowerQuery);
      })
      .sort((left, right) => {
        const leftOwned = left.processorApproverId === processorEditorApprover._id ? 0 : 1;
        const rightOwned = right.processorApproverId === processorEditorApprover._id ? 0 : 1;
        if (leftOwned !== rightOwned) return leftOwned - rightOwned;
        return left.name.localeCompare(right.name);
      });
  }, [processorEditorApprover, processorForms, processorQuery]);

  const needsReview = approvers.filter((item) => item.emailNeedsReview).length;
  const activeCount = approvers.filter((item) => item.isActive).length;
  const processorCapableCount = approvers.filter((item) => item.roles.includes("processor")).length;
  const processorRoutedFormsCount = processorForms.filter((form) => form.processorApproverId).length;
  const filteredIds = filtered.map((approver) => approver._id);
  const hasSelection = selectedApproverIds.length > 0;
  const visibleSelectedCount = filteredIds.filter((id) => selectedApproverIds.includes(id)).length;
  const allVisibleSelected = filteredIds.length > 0 && visibleSelectedCount === filteredIds.length;

  useEffect(() => {
    setSelectedRolesForAdd((prev) => prev.filter((role) => visibleRoles.includes(role)));
    setEditRoleSelections((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([approverId, selectedRoles]) => [
          approverId,
          selectedRoles.filter((role) => visibleRoles.includes(role)),
        ]),
      ),
    );
  }, [visibleRoles]);

  useEffect(() => {
    setSelectedApproverIds((prev) =>
      prev.filter((id) => approvers.some((approver) => approver._id === id)),
    );
  }, [approvers]);

  useEffect(() => {
    if (!showAddModal) {
      setSelectedRolesForAdd([]);
      setSelectedEmployeeEmail("");
      setDraftName("");
      setDraftEmail("");
    }
  }, [showAddModal]);

  useEffect(() => {
    if (!processorEditorId) setProcessorQuery("");
  }, [processorEditorId]);

  function beginEdit(approver: ApproverRow) {
    setEditingId(approver._id);
    setEditRoleSelections((prev) => ({
      ...prev,
      [approver._id]: uniqueVisibleRoles(approver.roles, visibleRoles),
    }));
  }

  function cancelEdit(approverId: string) {
    setEditingId((current) => (current === approverId ? null : current));
    setEditRoleSelections((prev) => {
      const next = { ...prev };
      delete next[approverId];
      return next;
    });
  }

  function updateRowRoles(approverId: string, nextRoles: string[]) {
    setEditRoleSelections((prev) => ({
      ...prev,
      [approverId]: uniqueVisibleRoles(nextRoles, visibleRoles),
    }));
  }

  function toggleApproverSelection(approverId: string, checked: boolean) {
    setSelectedApproverIds((prev) =>
      checked ? Array.from(new Set([...prev, approverId])) : prev.filter((id) => id !== approverId),
    );
  }

  function toggleVisibleApproverSelection(checked: boolean) {
    setSelectedApproverIds((prev) =>
      checked
        ? Array.from(new Set([...prev, ...filteredIds]))
        : prev.filter((id) => !filteredIds.includes(id)),
    );
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="People setup"
        title="Approvers"
        description="Manage global approver roles and processor routing ownership without changing each form's workflow rules."
        actions={
          <>
            <form action={syncApproversFromIntune}>
              <PendingSubmitButton
                type="submit"
                idleLabel="Sync from Intune"
                pendingLabel="Syncing approvers..."
                className="btn-secondary"
                disabled={!graphReady || !syncEnabled}
              />
            </form>
            <button
              type="button"
              onClick={() => {
                setSelectedRolesForAdd([]);
                setShowAddModal(true);
              }}
              className="btn-primary"
            >
              Add a new approver
            </button>
            <form action={recoverApproverEmails}>
              <PendingSubmitButton
                type="submit"
                idleLabel="Recover emails"
                pendingLabel="Recovering..."
                className="btn-secondary"
              />
            </form>
            <form action={syncLookupDropdownsFromApprovers}>
              <PendingSubmitButton
                type="submit"
                idleLabel="Sync dropdowns"
                pendingLabel="Syncing dropdowns..."
                className="btn-secondary"
              />
            </form>
            <Link href="/admin/forms" className="btn-secondary">
              Open forms routing
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <CompactMetricCard label="Total approvers" value={approvers.length} />
          <CompactMetricCard label="Active approvers" value={activeCount} tone="ok" />
          <CompactMetricCard label="Needs review" value={needsReview} tone={needsReview > 0 ? "warn" : "ok"} />
          <CompactMetricCard label="Processor-capable" value={processorCapableCount} />
          <CompactMetricCard label="Routed processor forms" value={processorRoutedFormsCount} />
        </div>
        <AdminHelpPanel title="What this page does">
          Use this page to maintain who can act as Immediate Superior, Department Head, Processor, HR, CEO,
          and other approval roles. Processor routing is scoped separately from those global roles: assign a
          person the <strong>processor</strong> role only when they should own processor steps, and assign the
          <strong>ceo</strong> role only when they should act as the shared CEO approver.
          {lastLookupDropdownSyncAt
            ? ` Role-driven dropdowns were last synced on ${formatSyncDateTime(lastLookupDropdownSyncAt)}.`
            : " Role-driven dropdowns have not been synced yet."}
          {!graphReady ? " Microsoft Graph credentials are still missing for Intune-based sync." : ""}
          {graphReady && !syncEnabled ? " Intune sync is configured but disabled because INTUNE_SYNC_ENABLED is off." : ""}
          {graphReady && syncEnabled
            ? " Sync from Intune refreshes the employee directory first, then updates matching approver profile fields without changing roles."
            : ""}
        </AdminHelpPanel>
      </div>

      {showAddModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setShowAddModal(false)}>
          <div
            className="w-full max-w-2xl rounded-md border border-surface-border bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-surface-text">Add a new approver</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-sm font-semibold text-surface-muted hover:text-surface-text">
                Close
              </button>
            </div>
            <form action={addApprover} className="space-y-4">
              <input type="hidden" name="name" value={draftName} />
              <input type="hidden" name="email" value={draftEmail} />
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-surface-text">Search employee</label>
                <SearchableSelect
                  value={selectedEmployeeEmail}
                  onChange={(email) => {
                    setSelectedEmployeeEmail(email);
                    const employee = employeeOptions.find((option) => option.email === email) ?? null;
                    setDraftName(employee?.fullName ?? "");
                    setDraftEmail(employee?.email ?? "");
                  }}
                  options={employeeSelectOptions}
                  placeholder="Select an employee from the employee table"
                />
              </div>
              {selectedEmployee ? (
                <div className="rounded-md border border-surface-border bg-slate-50 px-3 py-3 text-sm text-surface-text">
                  <p className="font-semibold">{selectedEmployee.fullName}</p>
                  <p className="text-surface-muted">{selectedEmployee.email}</p>
                  <p className="mt-1 text-xs text-surface-muted">
                    {selectedEmployee.department || "No department"}
                    {selectedEmployee.employeeId ? ` - ${selectedEmployee.employeeId}` : ""}
                    {selectedEmployee.jobTitle ? ` - ${selectedEmployee.jobTitle}` : ""}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <input
                    type="text"
                    name="manual_name_preview"
                    placeholder="Full name"
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    required
                    className="field-input"
                  />
                  <input
                    type="email"
                    name="manual_email_preview"
                    placeholder="email@vienovo.ph"
                    value={draftEmail}
                    onChange={(event) => setDraftEmail(event.target.value)}
                    className="field-input"
                  />
                </div>
              )}
              <div className="rounded-md border border-surface-border bg-slate-50 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">Quick role presets</p>
                  <p className="text-xs text-surface-muted">Apply one when you already know the common setup.</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ROLE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setSelectedRolesForAdd(uniqueVisibleRoles(preset.roles, visibleRoles))}
                      className="rounded border border-surface-border bg-white px-2.5 py-1 text-xs font-semibold text-surface-text transition hover:bg-slate-100"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-surface-text">
                <div className="w-full flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">Roles</p>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedRolesForAdd((prev) => (prev.length === visibleRoles.length ? [] : [...visibleRoles]))
                    }
                    className="border border-surface-border bg-white px-2 py-1 text-xs font-semibold text-surface-text transition hover:bg-slate-50"
                  >
                    {selectedRolesForAdd.length === visibleRoles.length ? "Clear all" : "Select all"}
                  </button>
                </div>
                <p className="w-full text-xs text-surface-muted">
                  CEO is a global approval role. Add processor separately only when the same person should own processor routing.
                </p>
                {visibleRoles.map((role) => (
                  <label key={role} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      name={`role_${role}`}
                      className="accent-brand-600"
                      checked={selectedRolesForAdd.includes(role)}
                      onChange={(event) =>
                        setSelectedRolesForAdd((prev) =>
                          event.target.checked ? Array.from(new Set([...prev, role])) : prev.filter((item) => item !== role),
                        )
                      }
                    />
                    <span>{roleLabel(role)}</span>
                  </label>
                ))}
              </div>
              <PendingSubmitButton type="submit" idleLabel="Add approver" pendingLabel="Adding..." className="btn-primary" />
            </form>
          </div>
        </div>
      ) : null}

      {showAddRoleModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setShowAddRoleModal(false)}>
          <div className="w-full max-w-md rounded-md border border-surface-border bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-surface-text">Add a new role</h3>
              <button type="button" onClick={() => setShowAddRoleModal(false)} className="text-sm font-semibold text-surface-muted hover:text-surface-text">
                Close
              </button>
            </div>
            <form action={addApproverRole} className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-surface-text">Name</label>
                <input type="text" name="name" required placeholder="ex: Regional Manager" className="field-input w-full" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-surface-text">Tags (roles column)</label>
                <input type="text" name="tags" required placeholder="ex: regionalManager" className="field-input w-full" />
              </div>
              <p className="text-xs text-surface-muted">Tag value is saved to the roles column and appears in role dropdowns.</p>
              <PendingSubmitButton type="submit" idleLabel="Add role" pendingLabel="Adding..." className="btn-primary" />
            </form>
          </div>
        </div>
      ) : null}

      {processorEditorApprover ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setProcessorEditorId(null)}>
          <div
            className="w-full max-w-3xl rounded-md border border-surface-border bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-surface-text">Manage processor routing</h3>
                <p className="text-sm text-surface-muted">
                  Assign forms that should route their processor step to <strong>{processorEditorApprover.name}</strong>.
                  This matches the <strong>Assigned processor</strong> setting on the forms registry.
                </p>
              </div>
              <button type="button" onClick={() => setProcessorEditorId(null)} className="text-sm font-semibold text-surface-muted hover:text-surface-text">
                Close
              </button>
            </div>
            {!processorEditorApprover.isActive || !processorEditorApprover.email ? (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                This approver must stay active and have an email address before they can hold processor routing.
                Saving now will clear any existing processor assignments for them.
              </div>
            ) : null}
            <form action={updateProcessorAssignments} className="space-y-3">
              <input type="hidden" name="id" value={processorEditorApprover._id} />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <input
                  type="search"
                  value={processorQuery}
                  onChange={(event) => setProcessorQuery(event.target.value)}
                  placeholder="Search forms by name or current owner"
                  className="field-input sm:max-w-sm"
                />
                <p className="text-xs text-surface-muted">
                  {processorEditorForms.length} form{processorEditorForms.length === 1 ? "" : "s"} shown
                </p>
              </div>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {processorEditorForms.map((form) => {
                  const assignedToCurrent = form.processorApproverId === processorEditorApprover._id;
                  const ownerSummary = form.processorApproverId
                    ? assignedToCurrent
                      ? "Currently assigned to this processor"
                      : `Currently assigned to ${form.processorApproverName || form.processorApproverEmail || "another processor"}`
                    : "Uses global processor fallback";

                  return (
                    <label
                      key={form.slug}
                      className={`flex items-start gap-3 rounded-md border px-3 py-3 text-sm ${
                        assignedToCurrent
                          ? "border-violet-200 bg-violet-50"
                          : "border-surface-border bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name={`assignedProcessorForm_${form.slug}`}
                        defaultChecked={assignedToCurrent}
                        className="mt-0.5 accent-brand-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-surface-text">{form.name}</span>
                        <span className="mt-1 block text-xs text-surface-muted">{ownerSummary}</span>
                      </span>
                    </label>
                  );
                })}
                {processorEditorForms.length === 0 ? (
                  <div className="rounded-md border border-dashed border-surface-border px-3 py-6 text-center text-sm text-surface-muted">
                    No forms match this search.
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-xs text-surface-muted">
                  Need deeper workflow routing changes? Use <Link href="/admin/forms" className="font-semibold text-brand-700 hover:underline">/admin/forms</Link>.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setProcessorEditorId(null)}
                    className="border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-surface-text transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <PendingSubmitButton
                    type="submit"
                    idleLabel="Save processor routing"
                    pendingLabel="Saving routing..."
                    className="btn-primary"
                  />
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <AdminSection
        title="Approver list"
        description="Search people, fix emails, assign roles in bulk, and manage processor routing separately from global roles."
        meta={`${filtered.length} of ${approvers.length} shown`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowApproverList((prev) => !prev)}
            className="border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-surface-text transition hover:bg-slate-50"
          >
            {showApproverList ? "Collapse approver list" : "Expand approver list"}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRoleManagement((prev) => !prev)}
              className="border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-surface-text transition hover:bg-slate-50"
            >
              {showRoleManagement ? "Hide Role" : "Show Role"}
            </button>
            <button
              type="button"
              onClick={() => setShowAddRoleModal(true)}
              className="border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-surface-text transition hover:bg-slate-50"
            >
              Add New Roles
            </button>
          </div>
        </div>

        {showRoleManagement ? (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
            onClick={() => setShowRoleManagement(false)}
          >
            <div
              className="w-full max-w-4xl rounded-md border border-surface-border bg-white p-4 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-surface-text">Role management</h3>
                <button
                  type="button"
                  onClick={() => setShowRoleManagement(false)}
                  className="text-sm font-semibold text-surface-muted hover:text-surface-text"
                >
                  Close
                </button>
              </div>
              <div className="overflow-x-hidden">
                <table className="admin-table w-full table-fixed">
                  <colgroup>
                    <col className="w-[30%] sm:w-[28%] md:w-[26%]" />
                    <col className="w-[40%] sm:w-[44%] md:w-[48%]" />
                    <col className="w-[30%] sm:w-[28%] md:w-[26%]" />
                  </colgroup>
                  <thead className="border-b border-surface-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">
                    <tr>
                      <th className="px-1.5 py-2">Name</th>
                      <th className="px-1.5 py-2">Tags</th>
                      <th className="px-1.5 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {visibleRoles.map((role) => (
                      <tr key={role} className="bg-white">
                        <td className="px-1.5 py-2 text-sm text-surface-text break-words">{roleLabel(role)}</td>
                        <td className="px-1.5 py-2">
                          {editingRole === role ? (
                            <input form={`edit-role-${role}`} name="tags" defaultValue={role} className="field-input w-full min-w-0" />
                          ) : (
                            <span className="block text-sm text-surface-text break-words">{role}</span>
                          )}
                        </td>
                        <td className="px-1.5 py-2">
                          <div className="flex items-center justify-start gap-1 whitespace-nowrap">
                            {editingRole === role ? (
                              <>
                                <form id={`edit-role-${role}`} action={editApproverRole}>
                                  <input type="hidden" name="previousRole" value={role} />
                                  <PendingSubmitButton type="submit" idleLabel="Save" pendingLabel="Saving..." className="border border-emerald-200 bg-emerald-50 px-1.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100" />
                                </form>
                                <button type="button" onClick={() => setEditingRole(null)} className="border border-surface-border bg-white px-1.5 py-1 text-xs font-semibold text-surface-muted transition hover:text-surface-text">
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button type="button" onClick={() => setEditingRole(role)} className="border border-emerald-200 bg-emerald-50 px-1.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100">
                                Edit
                              </button>
                            )}
                            <form
                              action={deleteApproverRole}
                              onSubmit={(event) => {
                                if (!confirm(`Delete role "${role}" from all approvers?`)) event.preventDefault();
                              }}
                            >
                              <input type="hidden" name="role" value={role} />
                              <PendingSubmitButton type="submit" idleLabel="Delete" pendingLabel="Deleting..." className="border border-red-200 bg-red-50 px-1.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100" />
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {showApproverList ? (
          <>
            <div className="mb-5 flex flex-col gap-3">
              <AdminSearchField value={query} onChange={setQuery} placeholder="Search by name, email, role, or department" />
              <AdminFilterTabs
                value={view}
                onChange={setView}
                options={[
                  { value: "all", label: "All" },
                  { value: "review", label: "Needs review" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                  { value: "hr_missing_email", label: "HR missing email" },
                ]}
              />
              <AdminFilterTabs
                value={roleFilter}
                onChange={setRoleFilter}
                options={[
                  { value: "all", label: "All roles" },
                  ...visibleRoles.map((role) => ({ value: role, label: roleLabel(role) })),
                ]}
              />
            </div>

            <form action={applyApproverBatchAction} className="mb-4 rounded-md border border-surface-border bg-slate-50 px-4 py-3">
              {selectedApproverIds.map((id) => (
                <input key={id} type="hidden" name="selectedApproverId" value={id} />
              ))}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-surface-text">
                    Bulk actions {hasSelection ? `(${selectedApproverIds.length} selected)` : ""}
                  </p>
                  <p className="text-xs text-surface-muted">
                    Remove the processor role or deactivate processors here, and their assigned processor forms will be cleared automatically.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <select
                    name="batchRole"
                    value={batchRole}
                    onChange={(event) => setBatchRole(event.target.value)}
                    className="field-input min-w-[220px]"
                  >
                    <option value="">Choose role for add/remove</option>
                    {visibleRoles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                  <PendingSubmitButton
                    type="submit"
                    name="batchAction"
                    value="add_role"
                    idleLabel="Add role"
                    pendingLabel="Applying..."
                    className="border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                    disabled={!hasSelection || !batchRole}
                  />
                  <PendingSubmitButton
                    type="submit"
                    name="batchAction"
                    value="remove_role"
                    idleLabel="Remove role"
                    pendingLabel="Applying..."
                    className="border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                    disabled={!hasSelection || !batchRole}
                    onClick={(event) => {
                      if (!confirm("Remove this role from every selected approver?")) event.preventDefault();
                    }}
                  />
                  <PendingSubmitButton
                    type="submit"
                    name="batchAction"
                    value="activate"
                    idleLabel="Activate"
                    pendingLabel="Applying..."
                    className="border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                    disabled={!hasSelection}
                  />
                  <PendingSubmitButton
                    type="submit"
                    name="batchAction"
                    value="deactivate"
                    idleLabel="Deactivate"
                    pendingLabel="Applying..."
                    className="border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                    disabled={!hasSelection}
                    onClick={(event) => {
                      if (!confirm("Deactivate every selected approver? Processor routing owned by those processors will be cleared.")) {
                        event.preventDefault();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedApproverIds([])}
                    className="border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-surface-text transition hover:bg-slate-100"
                    disabled={!hasSelection}
                  >
                    Clear selection
                  </button>
                </div>
              </div>
            </form>

            {filtered.length === 0 ? (
              <AdminEmptyState
                title="No approvers match these filters"
                description="Try a broader search or switch to a different filter."
              />
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead className="border-b border-surface-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">
                    <tr>
                      <th className="px-4 py-3">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={(event) => toggleVisibleApproverSelection(event.target.checked)}
                            className="accent-brand-600"
                          />
                          <span>Select</span>
                        </label>
                      </th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Roles</th>
                      <th className="px-4 py-3">Assigned processor forms</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {filtered.map((approver) => {
                      const assignedProcessorForms = processorFormsByApproverId.get(approver._id) ?? [];
                      const editRoles = editRoleSelections[approver._id] ?? uniqueVisibleRoles(approver.roles, visibleRoles);
                      const draftHasProcessor = editRoles.includes("processor");

                      return (
                        <tr key={approver._id} className="bg-white align-top">
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={selectedApproverIds.includes(approver._id)}
                              onChange={(event) => toggleApproverSelection(approver._id, event.target.checked)}
                              className="accent-brand-600"
                            />
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-medium text-surface-text">{approver.name}</p>
                            <p className="mt-1 text-xs text-surface-muted">
                              {approver.department || "No department"}
                              {approver.employeeId ? ` - ${approver.employeeId}` : ""}
                              {approver.jobTitle ? ` - ${approver.jobTitle}` : ""}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {approver.emailNeedsReview ? (
                                <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                                  Needs email review
                                </span>
                              ) : null}
                              {approver.roles.includes("ceo") ? (
                                <span className="inline-flex items-center rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
                                  Global CEO approver
                                </span>
                              ) : null}
                              {assignedProcessorForms.length > 0 ? (
                                <span className="inline-flex items-center rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700">
                                  {formatProcessorAssignmentCount(assignedProcessorForms.length)}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {editingId === approver._id ? (
                              <input
                                form={`approver-edit-${approver._id}`}
                                type="email"
                                name="email"
                                defaultValue={approver.email}
                                placeholder="email@vienovo.ph"
                                className={`w-[260px] field-input ${approver.emailNeedsReview ? "border-amber-300 bg-amber-50" : ""}`}
                              />
                            ) : (
                              <p className="text-sm text-surface-text">{approver.email || "No email"}</p>
                            )}
                            {approver.emailNeedsReview ? (
                              <p className="mt-2 text-xs text-amber-700">This email looks incomplete or needs checking.</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            {editingId === approver._id ? (
                              <div className="space-y-3">
                                <div className="flex flex-wrap gap-2">
                                  {ROLE_PRESETS.map((preset) => (
                                    <button
                                      key={preset.label}
                                      type="button"
                                      onClick={() => updateRowRoles(approver._id, preset.roles)}
                                      className="rounded border border-surface-border bg-slate-50 px-2.5 py-1 text-xs font-semibold text-surface-text transition hover:bg-slate-100"
                                    >
                                      {preset.label}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => updateRowRoles(approver._id, visibleRoles)}
                                    className="rounded border border-surface-border bg-white px-2.5 py-1 text-xs font-semibold text-surface-text transition hover:bg-slate-100"
                                  >
                                    Select all
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateRowRoles(approver._id, [])}
                                    className="rounded border border-surface-border bg-white px-2.5 py-1 text-xs font-semibold text-surface-text transition hover:bg-slate-100"
                                  >
                                    Clear all
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {visibleRoles.map((role) => (
                                    <label
                                      key={role}
                                      className="inline-flex items-center gap-1 rounded border border-surface-border bg-white px-2 py-1 text-xs"
                                    >
                                      <input
                                        form={`approver-edit-${approver._id}`}
                                        type="checkbox"
                                        name={`role_${role}`}
                                        checked={editRoles.includes(role)}
                                        onChange={(event) =>
                                          updateRowRoles(
                                            approver._id,
                                            event.target.checked
                                              ? [...editRoles, role]
                                              : editRoles.filter((item) => item !== role),
                                          )
                                        }
                                        className="accent-brand-600"
                                      />
                                      <span className="text-surface-text">{roleLabel(role)}</span>
                                    </label>
                                  ))}
                                </div>
                                <p className="text-xs text-surface-muted">
                                  CEO is a shared global approval role. Add processor only when this same person should also own processor routing for specific forms.
                                </p>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {approver.roles.length > 0 ? (
                                  approver.roles.map((role) => (
                                    <span
                                      key={role}
                                      className={`inline-flex items-center rounded border px-2 py-1 text-xs font-medium ${
                                        ROLE_TONE[role.toLowerCase()] ?? "border-slate-200 bg-slate-50 text-slate-700"
                                      }`}
                                    >
                                      {roleChipLabel(role)}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-sm text-surface-muted">No roles</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-2">
                              {assignedProcessorForms.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {assignedProcessorForms.slice(0, 3).map((form) => (
                                    <span
                                      key={form.slug}
                                      className="inline-flex items-center rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700"
                                    >
                                      {form.name}
                                    </span>
                                  ))}
                                  {assignedProcessorForms.length > 3 ? (
                                    <span className="inline-flex items-center rounded border border-surface-border bg-white px-2 py-1 text-xs font-medium text-surface-muted">
                                      +{assignedProcessorForms.length - 3} more
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <p className="text-sm text-surface-muted">No processor forms assigned.</p>
                              )}
                              {editingId === approver._id ? (
                                <p className="text-xs text-surface-muted">
                                  Processor routing is managed separately now. Save role changes first, then use <strong>Manage processor forms</strong>.
                                  {!draftHasProcessor ? " CEO remains separate and does not need processor routing." : ""}
                                </p>
                              ) : approver.roles.includes("processor") ? (
                                <>
                                  {!approver.isActive || !approver.email ? (
                                    <p className="text-xs text-amber-700">
                                      This processor must stay active and have an email address before forms can stay routed here.
                                    </p>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => setProcessorEditorId(approver._id)}
                                    className="border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-50"
                                  >
                                    Manage processor forms
                                  </button>
                                </>
                              ) : (
                                <p className="text-xs text-surface-muted">
                                  Processor form assignment only applies to people with the <strong>processor</strong> role.
                                  {approver.roles.includes("ceo") ? " CEO stays a separate global approval role." : ""}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <AdminStatusPill tone={approver.isActive ? "ok" : "neutral"}>
                              {approver.isActive ? "Active" : "Inactive"}
                            </AdminStatusPill>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              {editingId === approver._id ? (
                                <>
                                  <form id={`approver-edit-${approver._id}`} action={updateApprover}>
                                    <input type="hidden" name="id" value={approver._id} />
                                    <input type="hidden" name="department" value={approver.department || ""} />
                                    <PendingSubmitButton
                                      type="submit"
                                      idleLabel="Save"
                                      pendingLabel="Saving..."
                                      className="border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                                    />
                                  </form>
                                  <button
                                    type="button"
                                    onClick={() => cancelEdit(approver._id)}
                                    className="border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => beginEdit(approver)}
                                  className="border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                                >
                                  Edit
                                </button>
                              )}
                              <form action={toggleApprover}>
                                <input type="hidden" name="id" value={approver._id} />
                                <PendingSubmitButton
                                  type="submit"
                                  idleLabel={approver.isActive ? "Deactivate" : "Activate"}
                                  pendingLabel="Updating..."
                                  className="border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-surface-muted transition hover:text-surface-text"
                                />
                              </form>
                              <form action={deleteApprover}>
                                <input type="hidden" name="id" value={approver._id} />
                                <PendingSubmitButton
                                  type="submit"
                                  idleLabel="Delete"
                                  pendingLabel="Deleting..."
                                  className="border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                                  onClick={(event) => {
                                    if (!confirm(`Delete approver "${approver.name}"?`)) event.preventDefault();
                                  }}
                                />
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </AdminSection>
    </div>
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
