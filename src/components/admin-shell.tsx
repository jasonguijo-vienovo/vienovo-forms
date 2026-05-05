"use client";

import Link from "next/link";
import { useState } from "react";
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
  onSignOut: () => Promise<void>;
};

export function AdminShell({ children, email, onSignOut }: AdminShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-surface-background">
      <aside
        className={[
          "fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-surface-border bg-slate-50 transition-[width] duration-200 lg:flex",
          collapsed ? "w-24" : "w-72",
        ].join(" ")}
      >
        <div className="px-6 py-5">
          <div className="flex items-start gap-3">
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
        <div className={collapsed ? "px-3 pb-3" : "px-3 pb-4"}>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="grid h-9 w-9 place-items-center rounded-r-md border border-surface-border bg-white text-slate-700 transition hover:text-brand-700"
            aria-label={collapsed ? "Expand admin sidebar" : "Collapse admin sidebar"}
            title={collapsed ? "Expand admin sidebar" : "Collapse admin sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
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
            <button type="button" className="grid h-9 w-9 place-items-center transition hover:text-brand-700">
              <Bell className="h-5 w-5" />
            </button>
            <button type="button" className="grid h-9 w-9 place-items-center transition hover:text-brand-700">
              <CircleHelp className="h-5 w-5" />
            </button>
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

        <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
