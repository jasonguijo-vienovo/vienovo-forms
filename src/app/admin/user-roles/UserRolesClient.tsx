"use client";

import { useMemo, useState } from "react";
import { Crown, ShieldCheck, UserCog, UserRound } from "lucide-react";
import {
  AdminEmptyState,
  AdminHelpPanel,
  AdminMetricCard,
  AdminPageHeader,
  AdminSection,
  AdminStatusPill,
} from "@/components/admin-ui";
import { AdminFilterTabs, AdminSearchField } from "@/components/admin-ui-client";
import { PendingFormState } from "@/components/pending-form-state";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  demoteUserToRequester,
  promoteUserToAdmin,
  saveUserRole,
} from "./actions";

type UserRow = {
  id?: string;
  email: string;
  name: string;
  role: "user" | "admin";
  isEnvAdmin: boolean;
  firstSeenAt?: string;
  lastSeenAt?: string;
};

type ViewFilter = "all" | "admin" | "user" | "env";

function formatDate(value?: string) {
  if (!value) return "Not seen yet";
  return new Date(value).toLocaleString();
}

export function UserRolesClient({ users }: { users: UserRow[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewFilter>("all");
  const [showAddModal, setShowAddModal] = useState(false);

  const filtered = useMemo(() => {
    return users.filter((user) => {
      const matchesQuery =
        !query ||
        [user.name, user.email, user.role].join(" ").toLowerCase().includes(query.toLowerCase());
      if (!matchesQuery) return false;
      if (view === "admin") return user.role === "admin";
      if (view === "user") return user.role === "user";
      if (view === "env") return user.isEnvAdmin;
      return true;
    });
  }, [query, users, view]);

  const adminCount = users.filter((user) => user.role === "admin").length;
  const envAdminCount = users.filter((user) => user.isEnvAdmin).length;

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Access control"
        title="User roles"
        description="Promote or demote who can open the admin console. Approval and processor responsibilities still belong on their own pages."
        actions={
          <button type="button" onClick={() => setShowAddModal(true)} className="btn-primary">
            Promote or add a user
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AdminMetricCard label="Known users" value={users.length} />
          <AdminMetricCard label="Admins" value={adminCount} tone="ok" />
          <AdminMetricCard label="Requesters" value={users.filter((user) => user.role === "user").length} />
          <AdminMetricCard label="Env-locked admins" value={envAdminCount} hint="Managed by ADMIN_EMAILS" />
        </div>
        <AdminHelpPanel title="What this page does">
          Use this page for app access only. If someone should approve or process requests, keep using
          the Approvers or Processors pages. Emails listed in <code>ADMIN_EMAILS</code> are still
          forced as admin even if you demote them here.
        </AdminHelpPanel>
      </div>

      {showAddModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setShowAddModal(false)}>
          <div className="w-full max-w-2xl rounded-md border border-surface-border bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-surface-text">Promote or add a user</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-sm font-semibold text-surface-muted hover:text-surface-text">
                Close
              </button>
            </div>
            <form action={saveUserRole} className="max-w-4xl">
              <PendingFormState className="grid gap-4 md:grid-cols-[1fr_1fr_180px_auto]">
                <input name="name" placeholder="Full name (optional)" className="field-input" />
                <input name="email" type="email" required placeholder="name@vienovo.ph" className="field-input" />
                <select name="role" defaultValue="user" className="field-input">
                  <option value="user">Requester</option>
                  <option value="admin">Admin</option>
                </select>
                <PendingSubmitButton
                  type="submit"
                  idleLabel={
                    <span className="inline-flex items-center gap-2">
                      <UserCog className="h-4 w-4" />
                      <span>Save role</span>
                    </span>
                  }
                  pendingLabel="Saving..."
                  className="btn-primary"
                />
              </PendingFormState>
            </form>
          </div>
        </div>
      ) : null}

      <AdminSection
        title="Current user access"
        description="Search the current user list and quickly promote or demote access."
        meta={`${filtered.length} of ${users.length} shown`}
      >
        <div className="mb-5 flex flex-col gap-3">
          <AdminSearchField value={query} onChange={setQuery} placeholder="Search by name, email, or role" />
          <AdminFilterTabs
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "All users" },
              { value: "admin", label: "Admins" },
              { value: "user", label: "Requesters" },
              { value: "env", label: "Env admins" },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <AdminEmptyState
            title="No matching users"
            description="Try a different search or create the user role above."
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead className="border-b border-surface-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">First seen</th>
                  <th className="px-4 py-3">Last seen</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map((user) => (
                  <tr key={user.email} className="bg-white align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                          {user.role === "admin" ? <ShieldCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-surface-text">{user.name || user.email}</p>
                          <p className="truncate text-xs text-surface-muted">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <AdminStatusPill tone={user.role === "admin" ? "ok" : "neutral"}>
                          {user.role === "admin" ? "Admin" : "Requester"}
                        </AdminStatusPill>
                        {user.isEnvAdmin ? (
                          <AdminStatusPill tone="brand">
                            <span className="inline-flex items-center gap-1">
                              <Crown className="h-3 w-3" />
                              <span>Env admin</span>
                            </span>
                          </AdminStatusPill>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-surface-muted">{formatDate(user.firstSeenAt)}</td>
                    <td className="px-4 py-3 text-xs text-surface-muted">{formatDate(user.lastSeenAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {user.role === "admin" ? (
                        <form action={demoteUserToRequester} className="inline-flex">
                          <input type="hidden" name="email" value={user.email} />
                          <input type="hidden" name="name" value={user.name} />
                          <PendingSubmitButton
                            type="submit"
                            disabled={user.isEnvAdmin}
                            idleLabel="Demote to requester"
                            pendingLabel="Saving..."
                            className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </form>
                      ) : (
                        <form action={promoteUserToAdmin} className="inline-flex">
                          <input type="hidden" name="email" value={user.email} />
                          <input type="hidden" name="name" value={user.name} />
                          <PendingSubmitButton
                            type="submit"
                            idleLabel="Promote to admin"
                            pendingLabel="Saving..."
                            className="btn-primary"
                          />
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>
    </div>
  );
}
