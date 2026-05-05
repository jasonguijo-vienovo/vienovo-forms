"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  Boxes,
  ClipboardList,
  FileInput,
  FileText,
  GitBranch,
  Grid2X2,
  KeyRound,
  ListChecks,
  ShieldCheck,
  UserCircle,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const primaryLinks = [
  { href: "/admin", label: "Overview", icon: Grid2X2, exact: true },
  { href: "/admin/forms", label: "Forms registry", icon: Boxes },
  { href: "/admin/form-imports", label: "Importer", icon: FileInput },
  { href: "/admin/lookups", label: "Dropdowns", icon: ListChecks },
  { href: "/admin/approvers", label: "Approvers", icon: ShieldCheck },
  { href: "/admin/processors", label: "Processors", icon: UsersRound },
  { href: "/admin/user-roles", label: "User roles", icon: KeyRound },
  { href: "/admin/notifications", label: "Notification flow", icon: BellRing },
  { href: "/admin/reimbursement-routing", label: "Reimbursement routing", icon: GitBranch },
  { href: "/admin/requests", label: "Admin queue", icon: ClipboardList },
] as const;

const secondaryLinks = [
  { href: "/forms/travel-booking", label: "Travel form", icon: FileText },
  { href: "/forms/cash-advance", label: "Cash advance form", icon: FileText },
  { href: "/dashboard", label: "Requester mode", icon: UserCircle },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();

  return (
    <>
      <nav className="flex flex-1 flex-col gap-1.5 px-3 py-6 text-[13px] font-semibold">
        {primaryLinks.map((item) => (
          <AdminNavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            collapsed={collapsed}
            active={isActive(pathname, item.href, "exact" in item ? item.exact : false)}
          >
            {item.label}
          </AdminNavLink>
        ))}
      </nav>

      <div className="border-t border-surface-border px-3 py-5 text-[13px] font-semibold">
        {secondaryLinks.map((item) => (
          <AdminNavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            collapsed={collapsed}
            active={isActive(pathname, item.href)}
          >
            {item.label}
          </AdminNavLink>
        ))}
      </div>
    </>
  );
}

function AdminNavLink({
  href,
  icon: Icon,
  active,
  collapsed,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={typeof children === "string" ? children : undefined}
      className={cn(
        "flex items-center gap-3 rounded-r-md border-l-4 border-transparent px-3 py-2 uppercase tracking-[0.08em] text-slate-500 transition hover:bg-white hover:text-brand-700",
        active && "border-brand-700 bg-white text-brand-700 shadow-sm ring-1 ring-brand-100"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className={cn("truncate", collapsed && "hidden")}>{children}</span>
    </Link>
  );
}
