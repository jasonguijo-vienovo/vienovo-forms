import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { AdminShell } from "@/components/admin-shell";
import { getAdminSession } from "@/lib/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAdmin, session } = await getAdminSession();
  if (!isAdmin) redirect("/dashboard");
  const email = session?.user?.email ?? "";

  return (
    <AdminShell
      email={email}
      onSignOut={async () => {
        "use server";
        await signOut({ redirectTo: "/sign-in" });
      }}
    >
      {children}
    </AdminShell>
  );
}
