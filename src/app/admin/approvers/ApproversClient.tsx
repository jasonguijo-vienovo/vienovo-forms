"use client";

import { useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import Link from "next/link";
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
import { SearchableSelect } from "@/components/searchable-select";
import {
  addApprover,
  addApproverRole,
  deleteApprover,
  deleteApproverRole,
  editApproverRole,
  recoverApproverEmails,
  syncApproversFromIntune,
  toggleApprover,
  updateApprover,
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

type ViewFilter = "all" | "review" | "active" | "inactive" | "hr_missing_email";

function roleLabel(role: string) {
  if (role === "sla") return "SLA Approver";
  if (role === "cashAdvanceApprover") return "CA Approver";
  return role;
}

function roleChipLabel(role: string) {
  if (role === "sla") return "SLA";
  if (role === "cashAdvanceApprover") return "CA";
  return role;
}

const ROLE_TONE: Record<string, string> = {
  supervisor: "border-blue-200 bg-blue-50 text-blue-700",
  departmenthead: "border-indigo-200 bg-indigo-50 text-indigo-700",
  sla: "border-cyan-200 bg-cyan-50 text-cyan-700",
  cashadvance: "border-emerald-200 bg-emerald-50 text-emerald-700",
  finalapprover: "border-amber-200 bg-amber-50 text-amber-700",
  processor: "border-violet-200 bg-violet-50 text-violet-700",
  approver: "border-slate-200 bg-slate-50 text-slate-700",
};

export function ApproversClient({
  approvers,
  roles,
  employeeOptions,
  graphReady,
  syncEnabled,
}: {
  approvers: ApproverRow[];
  roles: string[];
  employeeOptions: EmployeeOption[];
  graphReady: boolean;
  syncEnabled: boolean;
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
  const visibleRoles = useMemo(
    () => roles.filter((role) => role.trim().toLowerCase() !== "far"),
    [roles],
  );

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

  const filtered = approvers.filter((approver) => {
    const matchesQuery =
      !query ||
      [approver.name, approver.email, approver.roles.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());

    if (!matchesQuery) return false;
    if (roleFilter !== "all" && !approver.roles.includes(roleFilter)) return false;
    if (view === "review") return approver.emailNeedsReview;
    if (view === "active") return approver.isActive;
    if (view === "inactive") return !approver.isActive;
    if (view === "hr_missing_email") return approver.roles.includes("hr") && (!approver.email || approver.emailNeedsReview);
    return true;
  });

  const needsReview = approvers.filter((item) => item.emailNeedsReview).length;
  const activeCount = approvers.filter((item) => item.isActive).length;

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="People setup"
        title="Approvers"
        description="Manage the people who approve requests. This page controls who can appear in approval steps, without changing the approval logic itself."
        actions={
          <>
            <form action={syncApproversFromIntune}>
              <PendingSubmitButton
                type="submit"
                idleLabel={
                  <span className="inline-flex items-center gap-2">
                    <RefreshCcw className="h-4 w-4" />
                    <span>Sync from Intune</span>
                  </span>
                }
                pendingLabel="Syncing approvers..."
                className="btn-secondary"
                disabled={!graphReady || !syncEnabled}
              />
            </form>
            <button type="button" onClick={() => setShowAddModal(true)} className="btn-primary">
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
            <Link href="/admin/processors" className="btn-secondary">
              Open processors list
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CompactMetricCard label="Total approvers" value={approvers.length} />
          <CompactMetricCard label="Active approvers" value={activeCount} tone="ok" />
          <CompactMetricCard label="Needs review" value={needsReview} tone={needsReview > 0 ? "warn" : "ok"} />
          <CompactMetricCard label="Processor-capable" value={approvers.filter((item) => item.roles.includes("processor")).length} />
        </div>
        <AdminHelpPanel title="What this page does">
          Use this page when someone should be available as an approver, supervisor, department head,
          cash advance approver, or final approver. If an email needs review, fix it here before relying
          on notification emails.
          {!graphReady ? " Microsoft Graph credentials are still missing for Intune-based sync." : ""}
          {graphReady && !syncEnabled ? " Intune sync is configured but disabled because INTUNE_SYNC_ENABLED is off." : ""}
          {graphReady && syncEnabled
            ? " Sync from Intune refreshes the employee directory first, then updates matching approver profile fields without changing roles."
            : ""}
        </AdminHelpPanel>
      </div>

      {showAddModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setShowAddModal(false)}>
          <div className="w-full max-w-2xl rounded-md border border-surface-border bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-surface-text">Add a new approver</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-sm font-semibold text-surface-muted hover:text-surface-text">
                Close
              </button>
            </div>
            <form action={addApprover} className="space-y-3">
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
              <div className="flex flex-wrap gap-3 text-sm text-surface-text">
                {visibleRoles.map((role) => (
                  <label key={role} className="flex items-center gap-1.5">
                    <input type="checkbox" name={`role_${role}`} className="accent-brand-600" />
                    <span className="capitalize">{role}</span>
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

      <AdminSection
        title="Approver list"
        description="Search people, fix emails that need review, and switch people on or off."
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
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[5%]" />
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
          <AdminSearchField value={query} onChange={setQuery} placeholder="Search by name, email, or role" />
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
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map((approver) => (
                  <tr key={approver._id} className="bg-white align-top">
                    <td className="px-4 py-4">
                      <p className="font-medium text-surface-text">{approver.name}</p>
                      <p className="mt-1 text-xs text-surface-muted">
                        {approver.department || "No department"}
                        {approver.employeeId ? ` - ${approver.employeeId}` : ""}
                        {approver.jobTitle ? ` - ${approver.jobTitle}` : ""}
                      </p>
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
                        <p className="text-sm text-surface-text">{approver.email}</p>
                      )}
                      {approver.emailNeedsReview ? (
                        <p className="mt-2 text-xs text-amber-700">This email looks incomplete or needs checking.</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      {editingId === approver._id ? (
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
                                defaultChecked={approver.roles.includes(role)}
                                className="accent-brand-600"
                              />
                              <span className="capitalize text-surface-text">{role}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {approver.roles.filter((role) => role.trim().toLowerCase() !== "far").length > 0 ? (
                            approver.roles
                              .filter((role) => role.trim().toLowerCase() !== "far")
                              .map((role) => (
                              <span
                                key={role}
                                className={`inline-flex items-center rounded border px-2 py-1 text-xs font-medium capitalize ${
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
                              onClick={() => setEditingId(null)}
                              className="border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingId(approver._id)}
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
                          />
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
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
