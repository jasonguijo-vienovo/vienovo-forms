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
      />

      <AdminHelpPanel title="What this page does">
        Use this page for app access only. If someone should approve or process requests, keep using
        the Approvers or Processors pages. Emails listed in <code>ADMIN_EMAILS</code> are still
        forced as admin even if you demote them here.
      </AdminHelpPanel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Known users" value={users.length} />
        <AdminMetricCard label="Admins" value={adminCount} tone="ok" />
        <AdminMetricCard label="Requesters" value={users.filter((user) => user.role === "user").length} />
        <AdminMetricCard label="Env-locked admins" value={envAdminCount} hint="Managed by ADMIN_EMAILS" />
      </div>

      <AdminSection
        title="Promote or add a user"
        description="You can pre-create a user role even before the person signs in for the first time."
      >
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
      </AdminSection>

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
          <div className="grid gap-4">
            {filtered.map((user) => (
              <section key={user.email} className="border border-surface-border bg-white p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                        {user.role === "admin" ? <ShieldCheck className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold text-surface-text">
                          {user.name || user.email}
                        </h3>
                        <p className="truncate text-sm text-surface-muted">{user.email}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
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
                    <p className="mt-3 text-xs text-surface-muted">
                      First seen: {formatDate(user.firstSeenAt)}
                      {" • "}
                      Last seen: {formatDate(user.lastSeenAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {user.role === "admin" ? (
                      <form action={demoteUserToRequester}>
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
                      <form action={promoteUserToAdmin}>
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
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </AdminSection>
    </div>
  );
}
