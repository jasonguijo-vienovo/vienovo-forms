import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getNavbarForms } from "@/lib/form-definitions";
import { safeAuth } from "@/lib/safe-auth";

const HELP_DESK_URL = "https://itdashboard-mu.vercel.app/helpdesk/";
const BRAND_LOGO_SRC = "/brand/vienovo-feed-for-life.png";

export async function Navbar({
  adminShortcut,
}: {
  adminShortcut?: { href: string; label: string } | null;
} = {}) {
  const session = await safeAuth();
  const showAdmin = isAdminEmail(session?.user?.email);
  const navbarForms = await getNavbarForms();

  return (
    <header className="bg-gradient-to-r from-brand-700 via-brand-800 to-brand-900 text-white shadow-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="rounded-lg bg-white/90 px-2 py-1 ring-2 ring-white/25">
            <Image
              src={BRAND_LOGO_SRC}
              alt="Vienovo"
              width={132}
              height={28}
              priority
              className="h-7 w-auto"
            />
          </div>
        </Link>

        <nav className="hidden sm:flex items-center gap-1 text-sm">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NewRequestMenu
            options={navbarForms.map((form) => ({
              href: form.routePath || `/forms/${form.slug}`,
              title: form.name,
              subtitle: form.description,
            }))}
          />
          <ExternalNavLink href={HELP_DESK_URL}>Helpdesk</ExternalNavLink>
          {showAdmin && adminShortcut ? (
            <NavLink href={adminShortcut.href}>{adminShortcut.label}</NavLink>
          ) : null}
          {showAdmin && <NavLink href="/admin">Admin</NavLink>}
        </nav>

        {session?.user ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden md:inline text-brand-100">{session.user.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/sign-in" });
              }}
            >
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition text-sm font-medium"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/sign-in"
            className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition text-sm font-medium"
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
      className="px-3 py-1.5 rounded-lg hover:bg-white/15 transition font-medium"
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
      className="px-3 py-1.5 rounded-lg hover:bg-white/15 transition font-medium"
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
      <summary className="list-none px-3 py-1.5 rounded-lg hover:bg-white/15 transition font-medium cursor-pointer select-none">
        New request <span className="text-[10px] align-middle opacity-90">▼</span>
      </summary>
      <div className="absolute z-50 mt-2 w-64 rounded-xl border border-brand-100 bg-white text-gray-800 shadow-lg overflow-hidden">
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
