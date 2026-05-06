"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CircleHelp,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserCircle,
} from "lucide-react";
import { AdminNav } from "@/components/admin-nav";
import { PendingSubmitButton } from "@/components/pending-submit-button";

type AdminShellProps = {
  children: React.ReactNode;
  email: string;
  approvalNotifications: Array<{
    referenceNo: string;
    formName: string;
    assignee: string;
    updatedAt: string;
  }>;
  systemNotifications: Array<{
    action: string;
    actorEmail: string;
    target: string;
    outcome: string;
    createdAt: string;
  }>;
  onSignOut: () => Promise<void>;
};

export function AdminShell({
  children,
  email,
  approvalNotifications,
  systemNotifications,
  onSignOut,
}: AdminShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const [readApprovals, setReadApprovals] = useState<Record<string, boolean>>({});
  const [readSystem, setReadSystem] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 45000);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    try {
      setReadApprovals(JSON.parse(localStorage.getItem("admin_read_approvals") || "{}"));
      setReadSystem(JSON.parse(localStorage.getItem("admin_read_system") || "{}"));
    } catch {}
  }, []);

  function persistApprovals(next: Record<string, boolean>) {
    setReadApprovals(next);
    localStorage.setItem("admin_read_approvals", JSON.stringify(next));
  }

  function persistSystem(next: Record<string, boolean>) {
    setReadSystem(next);
    localStorage.setItem("admin_read_system", JSON.stringify(next));
  }

  const unreadApprovalCount = useMemo(
    () => approvalNotifications.filter((item) => !readApprovals[item.referenceNo]).length,
    [approvalNotifications, readApprovals]
  );
  const unreadSystemCount = useMemo(
    () =>
      systemNotifications.filter(
        (item, i) => !readSystem[`${item.action}|${item.target}|${item.createdAt}|${i}`]
      ).length,
    [systemNotifications, readSystem]
  );

  return (
    <div className="admin-bg min-h-screen">
      <aside
        className={[
          "fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-surface-border bg-slate-50 transition-[width] duration-200 lg:flex",
          collapsed ? "w-24" : "w-72",
        ].join(" ")}
      >
        <div className="px-6 py-5">
          <div className={collapsed ? "flex justify-center" : "flex items-start gap-3"}>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded bg-brand-700 text-lg font-black text-white">
              V
            </div>
            <div className="min-w-0 flex-1">
              <div className={collapsed ? "hidden" : "block"}>
                <p className="text-sm font-black uppercase tracking-wider text-brand-700">Admin Console</p>
                <p className="text-xs text-surface-muted">Enterprise Management</p>
              </div>
            </div>
          </div>
          <div className={collapsed ? "mt-3 flex justify-center" : "mt-3 flex justify-end"}>
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="grid h-9 w-9 place-items-center rounded-md border border-surface-border bg-white text-slate-700 transition hover:text-brand-700"
              aria-label={collapsed ? "Expand admin sidebar" : "Collapse admin sidebar"}
              title={collapsed ? "Expand admin sidebar" : "Collapse admin sidebar"}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <AdminNav collapsed={collapsed} />
      </aside>

      <div className={collapsed ? "lg:ml-24" : "lg:ml-72"}>
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-surface-border bg-white px-5">
          <div className="flex items-center gap-3">
            <details className="relative lg:hidden">
              <summary
                className="grid h-9 w-9 cursor-pointer list-none place-items-center border border-surface-border bg-white text-slate-700"
                aria-label="Open admin navigation"
              >
                <Menu className="h-5 w-5" />
              </summary>
              <div className="absolute left-0 top-11 z-50 max-h-[75vh] w-[min(88vw,320px)] overflow-auto border border-surface-border bg-slate-50 shadow-lg">
                <AdminNav />
              </div>
            </details>
            <Link href="/admin" className="text-xl font-bold tracking-tight text-brand-700">
              Vienovo Forms
            </Link>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <details className="relative">
              <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center transition hover:text-brand-700">
                <Bell className="h-5 w-5" />
                {unreadApprovalCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                    {unreadApprovalCount > 9 ? "9+" : unreadApprovalCount}
                  </span>
                ) : null}
              </summary>
              <div className="absolute right-0 top-10 z-50 w-[min(92vw,380px)] rounded-md border border-surface-border bg-white shadow-lg">
                <div className="border-b border-surface-border px-4 py-3">
                  <p className="text-sm font-semibold text-surface-text">Approval email notifications</p>
                  <p className="text-xs text-surface-muted">Pending approval queue requiring email flow.</p>
                </div>
                <div className="max-h-[360px] overflow-auto p-2">
                  {approvalNotifications.length > 0 ? approvalNotifications.map((item) => (
                    <div key={item.referenceNo} className="rounded border border-surface-border px-3 py-2 mb-2">
                      <p className="text-xs font-semibold text-surface-text">{item.referenceNo}</p>
                      <p className="text-xs text-surface-muted truncate">{item.formName}</p>
                      <p className="text-xs text-surface-muted truncate">Assignee: {item.assignee}</p>
                      <p className="text-[11px] text-surface-muted mt-1">{new Date(item.updatedAt).toLocaleString()}</p>
                      <div className="mt-2 flex gap-2">
                        <Link
                          href={`/admin/requests?q=${encodeURIComponent(item.referenceNo)}`}
                          className="text-xs font-semibold text-brand-700 hover:underline"
                          onClick={() => persistApprovals({ ...readApprovals, [item.referenceNo]: true })}
                        >
                          Open in queue
                        </Link>
                        {!readApprovals[item.referenceNo] ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-surface-muted hover:text-surface-text"
                            onClick={() => persistApprovals({ ...readApprovals, [item.referenceNo]: true })}
                          >
                            Mark read
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )) : <p className="px-2 py-3 text-xs text-surface-muted">No pending approval notifications.</p>}
                </div>
                <div className="border-t border-surface-border p-2 space-y-2">
                  <button
                    type="button"
                    className="btn-secondary w-full justify-center"
                    onClick={() =>
                      persistApprovals(
                        Object.fromEntries(approvalNotifications.map((item) => [item.referenceNo, true]))
                      )
                    }
                  >
                    Mark all as read
                  </button>
                  <Link href="/admin/notifications" className="btn-secondary w-full justify-center">Open notification flow</Link>
                </div>
              </div>
            </details>
            <details className="relative">
              <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center transition hover:text-brand-700">
                <CircleHelp className="h-5 w-5" />
                {unreadSystemCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-600 px-1 text-[10px] font-bold text-white">
                    {unreadSystemCount > 9 ? "9+" : unreadSystemCount}
                  </span>
                ) : null}
              </summary>
              <div className="absolute right-0 top-10 z-50 w-[min(92vw,420px)] rounded-md border border-surface-border bg-white shadow-lg">
                <div className="border-b border-surface-border px-4 py-3">
                  <p className="text-sm font-semibold text-surface-text">System activity</p>
                  <p className="text-xs text-surface-muted">Recent update, error, delete, and edit actions.</p>
                </div>
                <div className="max-h-[360px] overflow-auto p-2">
                  {systemNotifications.length > 0 ? systemNotifications.map((item, i) => (
                    <div key={`${item.target}-${i}`} className="rounded border border-surface-border px-3 py-2 mb-2">
                      <p className="text-xs font-semibold text-surface-text">{item.action}</p>
                      <p className="text-xs text-surface-muted truncate">{item.target || "system"}</p>
                      <p className="text-xs text-surface-muted truncate">By: {item.actorEmail}</p>
                      <p className="text-[11px] mt-1">
                        <span className={item.outcome === "success" ? "text-green-700" : "text-red-700"}>{item.outcome}</span>
                        {" - "}
                        <span className="text-surface-muted">{new Date(item.createdAt).toLocaleString()}</span>
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Link href="/admin" className="text-xs font-semibold text-brand-700 hover:underline">
                          Open context
                        </Link>
                        <button
                          type="button"
                          className="text-xs font-semibold text-surface-muted hover:text-surface-text"
                          onClick={() => {
                            const key = `${item.action}|${item.target}|${item.createdAt}|${i}`;
                            persistSystem({ ...readSystem, [key]: true });
                          }}
                        >
                          Mark read
                        </button>
                      </div>
                    </div>
                  )) : <p className="px-2 py-3 text-xs text-surface-muted">No recent system activity.</p>}
                </div>
              </div>
            </details>
            <Link href="/dashboard" className="grid h-9 w-9 place-items-center transition hover:text-brand-700">
              <UserCircle className="h-5 w-5" />
            </Link>
            <span className="hidden max-w-[220px] truncate text-xs text-surface-muted xl:inline">
              {email}
            </span>
            <form action={onSignOut}>
              <PendingSubmitButton
                type="submit"
                idleLabel={<LogOut className="h-4 w-4" />}
                pendingLabel="..."
                title="Sign out"
                className="grid h-9 w-9 place-items-center text-slate-700 transition hover:text-brand-700"
              />
            </form>
          </div>
        </header>

        <main className="w-full px-3 py-5 sm:px-4 lg:px-6 xl:px-8 2xl:px-10">{children}</main>
      </div>
    </div>
  );
}
