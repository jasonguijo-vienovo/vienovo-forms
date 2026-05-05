import Link from "next/link";
import { Bell, ChevronDown, CircleHelp, UserCircle } from "lucide-react";
import { signOut } from "@/auth";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { isAdminUser } from "@/lib/admin";
import { getNavbarForms } from "@/lib/form-definitions";
import { safeAuth } from "@/lib/safe-auth";

const HELP_DESK_URL = "https://itdashboard-mu.vercel.app/helpdesk/";

export async function Navbar({
  adminShortcut,
}: {
  adminShortcut?: { href: string; label: string } | null;
} = {}) {
  const session = await safeAuth();
  const showAdmin = await isAdminUser(session?.user?.email);
  const navbarForms = await getNavbarForms();

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-surface-border bg-white">
      <div className="flex h-full items-center justify-between px-5">
        <Link href="/dashboard" className="text-xl font-bold tracking-tight text-brand-700">
          Vienovo Forms
        </Link>

        <nav className="hidden sm:flex h-full items-center gap-6 text-sm">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NewRequestMenu
            options={navbarForms.map((form) => ({
              href: form.routePath || `/forms/${form.slug}`,
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
                className="hidden md:inline-flex border border-surface-border bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
              >
                {adminShortcut.label}
              </Link>
            ) : null}
            {showAdmin ? (
              <Link
                href="/admin"
                className="hidden md:inline-flex border border-surface-border bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
              >
                Admin
              </Link>
            ) : null}
            <button className="hidden sm:inline-flex p-2 text-slate-700 transition hover:text-brand-700" type="button">
              <Bell className="h-5 w-5" />
            </button>
            <a className="hidden sm:inline-flex p-2 text-slate-700 transition hover:text-brand-700" href={HELP_DESK_URL} target="_blank" rel="noopener noreferrer">
              <CircleHelp className="h-5 w-5" />
            </a>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/sign-in" });
              }}
            >
              <PendingSubmitButton
                type="submit"
                title={session.user.email ?? "Sign out"}
                idleLabel={<UserCircle className="h-5 w-5" />}
                pendingLabel="Signing out..."
                className="p-2 text-slate-700 transition hover:text-brand-700"
              />
            </form>
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
  options: Array<{ href: string; title: string; subtitle: string }>;
}) {
  return (
    <details className="relative">
      <summary className="flex h-14 list-none items-center border-b-2 border-transparent px-1 font-semibold text-slate-700 transition hover:border-brand-700 hover:text-brand-700 cursor-pointer select-none">
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
  title,
  subtitle,
}: {
  href: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} className="block px-3 py-2 hover:bg-brand-50 transition">
      <div className="text-sm font-semibold text-gray-800">{title}</div>
      <div className="text-[11px] text-gray-500">{subtitle}</div>
    </Link>
  );
}
