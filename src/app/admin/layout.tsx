import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { getAdminSession } from "@/lib/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) redirect("/dashboard");

  return (
    <>
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
          <aside>
            <div className="sticky top-6 bg-white rounded-2xl shadow-sm border border-brand-100 p-3">
              <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-brand-700 px-2 mb-2">
                Admin
              </p>
              <nav className="flex flex-col gap-0.5 text-sm">
                <AdminLink href="/admin">Overview</AdminLink>
                <AdminLink href="/admin/lookups">Dropdowns</AdminLink>
                <AdminLink href="/admin/approvers">Approvers</AdminLink>
                <AdminLink href="/admin/reimbursement-routing">Reimbursement routing</AdminLink>
              </nav>
            </div>
          </aside>
          <section>{children}</section>
        </div>
      </div>
    </>
  );
}

function AdminLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-lg hover:bg-brand-50 hover:text-brand-700 text-gray-600 transition font-medium"
    >
      {children}
    </Link>
  );
}
