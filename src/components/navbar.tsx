import Link from "next/link";
import { Bell, ChevronDown, CircleHelp, Menu, UserCircle } from "lucide-react";
import { signOut } from "@/auth";
import { ClickDropdown } from "@/components/click-dropdown";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { isAdminEmail } from "@/lib/admin";
import { canAccessApprovals } from "@/lib/approval-access";
import { connectMongo } from "@/lib/db/mongo";
import { getFormLaunchHref, getNavbarForms, isExternalFormLaunch } from "@/lib/form-definitions";
import { safeAuth } from "@/lib/safe-auth";
import { AuditLog } from "@/models/AuditLog";
import { RequestModel } from "@/models/Request";

const HELP_DESK_URL = "https://itdashboard-mu.vercel.app/helpdesk/";

export async function Navbar({
  adminShortcut,
  showSystemActivity = false,
}: {
  adminShortcut?: { href: string; label: string } | null;
  showSystemActivity?: boolean;
} = {}) {
  const session = await safeAuth();
  const showAdmin = isAdminEmail(session?.user?.email);
  const showApprovals = await canAccessApprovals(session?.user?.email);
  const navbarForms = await getNavbarForms();
  const userEmail = session?.user?.email?.toLowerCase() ?? "";

  let dashboardNotifications: Array<{ referenceNo: string; status: string; updatedAt: string }> = [];
  let systemItems: Array<{ action: string; target: string; createdAt: string }> = [];
  let pendingApprovalsCount = 0;
  const checkedAt = new Date().toISOString();

  if (showAdmin && userEmail) {
    try {
      await connectMongo();
      const [requests, audits, pendingCount] = await Promise.all([
        RequestModel.find({ "submittedBy.email": userEmail })
          .sort({ updatedAt: -1 })
          .limit(8)
          .select({ referenceNo: 1, status: 1, updatedAt: 1 })
          .lean(),
        AuditLog.find({ action: { $regex: /(update|error|delete|edit)/i } })
          .sort({ createdAt: -1 })
          .limit(8)
          .select({ action: 1, targetType: 1, targetId: 1, createdAt: 1 })
          .lean(),
        RequestModel.countDocuments({
          status: "pending",
          $or: [
            { currentActorEmail: userEmail },
            { approvalChain: { $elemMatch: { approverEmail: userEmail, status: "pending" } } },
          ],
        }),
      ]);

      dashboardNotifications = requests.map((row: any) => ({
        referenceNo: String(row.referenceNo || ""),
        status: String(row.status || "pending"),
        updatedAt: new Date(row.updatedAt).toISOString(),
      }));
      systemItems = audits.map((row: any) => ({
        action: String(row.action || "update"),
        target: `${String(row.targetType || "")}:${String(row.targetId || "")}`.replace(/:$/, ""),
        createdAt: new Date(row.createdAt).toISOString(),
      }));
      pendingApprovalsCount = Number(pendingCount ?? 0);
    } catch {
      dashboardNotifications = [];
      systemItems = [];
      pendingApprovalsCount = 0;
    }
  }

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-surface-border bg-white/92 backdrop-blur">
      <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          {session?.user ? (
            <details className="relative sm:hidden">
              <summary
                className="grid h-10 w-10 list-none place-items-center rounded-lg border border-surface-border bg-white text-slate-700 shadow-sm transition hover:text-brand-700"
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </summary>
              <div className="absolute left-0 top-12 z-50 w-[min(92vw,320px)] overflow-hidden rounded-2xl border border-surface-border bg-white shadow-lg">
                <div className="border-b border-surface-border bg-slate-50/70 px-4 py-3">
                  <p className="text-sm font-semibold text-surface-text">
                    {session.user.name || "Workspace"}
                  </p>
                  <p className="text-xs text-surface-muted truncate">
                    {session.user.email || ""}
                  </p>
                </div>
                <div className="grid gap-1 p-2">
                  <MobileNavLink href="/dashboard" label="Dashboard" />
                  <MobileNavLink href="/forms" label="Browse forms" />
                  {showApprovals ? <MobileNavLink href="/approvals" label="Approvals" /> : null}
                  <MobileExternalNavLink href={HELP_DESK_URL} label="Helpdesk" />
                  {showAdmin && adminShortcut ? (
                    <MobileNavLink href={adminShortcut.href} label={adminShortcut.label} />
                  ) : null}
                  {showAdmin ? <MobileNavLink href="/admin" label="Admin console" /> : null}
                </div>
                <div className="border-t border-surface-border p-2">
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/sign-in" });
                    }}
                  >
                    <PendingSubmitButton
                      type="submit"
                      title={session.user.email ?? "Sign out"}
                      idleLabel="Sign out"
                      pendingLabel="Signing out..."
                      className="btn-secondary w-full justify-center"
                    />
                  </form>
                </div>
              </div>
            </details>
          ) : null}
          <Link href="/dashboard" className="truncate text-lg font-bold tracking-tight text-brand-700 sm:text-xl">
            Vienovo Forms
          </Link>
        </div>

        <nav className="hidden h-full items-center gap-6 text-sm sm:flex">
          <NavLink href="/dashboard">Dashboard</NavLink>
          {showApprovals ? <NavLink href="/approvals">Approvals</NavLink> : null}
          <NewRequestMenu
            options={navbarForms.map((form) => ({
              href: getFormLaunchHref(form),
              external: isExternalFormLaunch(form),
              title: form.name,
              subtitle: form.description,
            }))}
          />
          <ExternalNavLink href={HELP_DESK_URL}>Helpdesk</ExternalNavLink>
        </nav>

        {session?.user ? (
          <div className="flex items-center gap-3 text-sm text-slate-700">
            {showAdmin && adminShortcut ? (
              <Link
                href={adminShortcut.href}
                className="hidden rounded-lg border border-surface-border bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 md:inline-flex"
              >
                {adminShortcut.label}
              </Link>
            ) : null}
            {showAdmin ? (
              <Link
                href="/admin"
                className="hidden rounded-lg border border-surface-border bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 md:inline-flex"
              >
                Admin
              </Link>
            ) : null}
            {showAdmin ? (
              <ClickDropdown
                className="relative hidden sm:block"
                triggerClassName="inline-flex p-2 text-slate-700 transition hover:text-brand-700"
                panelClassName="absolute right-0 top-10 z-50 w-[min(92vw,340px)] rounded-md border border-surface-border bg-white shadow-lg"
                trigger={<Bell className="h-5 w-5" />}
              >
                  <div className="border-b border-surface-border px-3 py-2">
                    <p className="text-sm font-semibold text-surface-text">Your request status</p>
                    <p className="text-[11px] text-surface-muted">Last checked: {new Date(checkedAt).toLocaleTimeString()}</p>
                  </div>
                  <div className="max-h-[320px] overflow-auto p-2">
                    {dashboardNotifications.length > 0 ? dashboardNotifications.map((item) => (
                      <Link key={item.referenceNo} href={`/requests/${item.referenceNo}`} className="mb-2 block rounded border border-surface-border px-3 py-2 hover:bg-slate-50">
                        <p className="text-xs font-semibold text-surface-text">{item.referenceNo}</p>
                        <p className="mt-1">
                          <span className={`status-pill ${statusTone(item.status)}`}>{item.status}</span>
                        </p>
                        <p className="text-[11px] text-surface-muted mt-1">{new Date(item.updatedAt).toLocaleString()}</p>
                      </Link>
                    )) : <p className="px-2 py-3 text-xs text-surface-muted">No request notifications yet.</p>}
                  </div>
              </ClickDropdown>
            ) : null}
            {showAdmin && showSystemActivity ? (
              <ClickDropdown
                className="relative hidden sm:block"
                triggerClassName="inline-flex p-2 text-slate-700 transition hover:text-brand-700"
                panelClassName="absolute right-0 top-10 z-50 w-[min(92vw,360px)] rounded-md border border-surface-border bg-white shadow-lg"
                trigger={<CircleHelp className="h-5 w-5" />}
              >
                  <div className="border-b border-surface-border px-3 py-2">
                    <p className="text-sm font-semibold text-surface-text">System activity</p>
                    <p className="text-[11px] text-surface-muted">Last checked: {new Date(checkedAt).toLocaleTimeString()}</p>
                  </div>
                  <div className="max-h-[320px] overflow-auto p-2">
                    {systemItems.length > 0 ? systemItems.map((item, i) => (
                      <div key={`${item.target}-${i}`} className="mb-2 rounded border border-surface-border px-3 py-2">
                        <p className="text-xs font-semibold text-surface-text">{systemTitle(item.action)}</p>
                        <p className="text-xs text-surface-muted truncate">{systemMessage(item.action, item.target)}</p>
                        <p className="text-[11px] text-surface-muted mt-1">{new Date(item.createdAt).toLocaleString()}</p>
                      </div>
                    )) : <p className="px-2 py-3 text-xs text-surface-muted">No recent system activity.</p>}
                  </div>
              </ClickDropdown>
            ) : null}
            <ClickDropdown
              className="relative block"
              triggerClassName="inline-flex p-2 text-slate-700 transition hover:text-brand-700"
              panelClassName="absolute right-0 top-10 z-50 w-[min(92vw,280px)] rounded-md border border-surface-border bg-white shadow-lg"
              trigger={<UserCircle className="h-5 w-5" />}
            >
                <div className="border-b border-surface-border px-3 py-2">
                  <p className="text-sm font-semibold text-surface-text">
                    {session.user.name || "Signed in"}
                  </p>
                  <p className="text-xs text-surface-muted truncate">
                    {session.user.email || ""}
                  </p>
                </div>
                <div className="p-2">
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/sign-in" });
                    }}
                  >
                    <PendingSubmitButton
                      type="submit"
                      title={session.user.email ?? "Sign out"}
                      idleLabel="Sign out"
                      pendingLabel="Signing out..."
                      className="btn-secondary w-full justify-center"
                    />
                  </form>
                </div>
            </ClickDropdown>
          </div>
        ) : (
          <Link
            href="/sign-in"
            className="border border-surface-border bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

function statusTone(status: string) {
  if (status === "approved") return "border-green-200 bg-green-50 text-green-800";
  if (status === "rejected") return "border-red-200 bg-red-50 text-red-800";
  if (status === "returned") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function systemTitle(action: string) {
  const value = action.toLowerCase();
  if (value.includes("error") || value.includes("fail")) return "System error detected";
  if (value.includes("delete") || value.includes("remove")) return "Record deleted";
  if (value.includes("edit") || value.includes("update")) return "Settings updated";
  return "System activity";
}

function systemMessage(action: string, target: string) {
  const readable = action.replace(/[_-]+/g, " ").trim();
  const verb = readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : "Activity";
  return `${verb} on ${target || "system record"}`;
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex h-full items-center border-b-2 border-transparent px-1 font-semibold text-slate-700 transition hover:border-brand-700 hover:text-brand-700"
    >
      {children}
    </Link>
  );
}

function ExternalNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-full items-center border-b-2 border-transparent px-1 font-semibold text-slate-700 transition hover:border-brand-700 hover:text-brand-700"
    >
      {children}
    </a>
  );
}

function NewRequestMenu({
  options,
}: {
  options: Array<{ href: string; external: boolean; title: string; subtitle: string }>;
}) {
  return (
    <details className="relative">
      <summary className="flex h-14 list-none cursor-pointer select-none items-center border-b-2 border-transparent px-1 font-semibold text-slate-700 transition hover:border-brand-700 hover:text-brand-700">
        <span className="inline-flex items-center gap-1">
          New request <ChevronDown className="h-3.5 w-3.5 opacity-90" />
        </span>
      </summary>
      <div className="absolute z-50 mt-2 w-72 overflow-hidden border border-surface-border bg-white text-gray-800 shadow-lg">
        <div className="py-1">
          {options.map((option) => (
            <MenuLink
              key={option.href}
              href={option.href}
              external={option.external}
              title={option.title}
              subtitle={option.subtitle}
            />
          ))}
          <div className="px-3 py-2 text-[11px] text-gray-400 border-t border-brand-50">
            <Link href="/forms" className="text-brand-700 hover:underline">
              View all forms
            </Link>
          </div>
        </div>
      </div>
    </details>
  );
}

function MenuLink({
  href,
  external,
  title,
  subtitle,
}: {
  href: string;
  external: boolean;
  title: string;
  subtitle: string;
}) {
  const className = "block px-3 py-2 hover:bg-brand-50 transition";

  if (external) {
    return (
      <a href={href} className={className}>
        <div className="text-sm font-semibold text-gray-800">{title}</div>
        <div className="text-[11px] text-gray-500">{subtitle}</div>
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      <div className="text-sm font-semibold text-gray-800">{title}</div>
      <div className="text-[11px] text-gray-500">{subtitle}</div>
    </Link>
  );
}

function MobileNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold text-surface-text transition hover:border-brand-100 hover:bg-brand-50"
    >
      {label}
    </Link>
  );
}

function MobileExternalNavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold text-surface-text transition hover:border-brand-100 hover:bg-brand-50"
    >
      {label}
    </a>
  );
}
