import { redirect } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { getCatalogForms } from "@/lib/form-definitions";
import { safeAuth } from "@/lib/safe-auth";
import { FormsCatalogClient } from "./FormsCatalogClient";

export default async function FormsIndexPage() {
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");
  const forms = await getCatalogForms({
    allowFallback: true,
    includeUnavailable: true,
    includeDrafts: true,
  });

  return (
    <>
      <Navbar />
      <main className="app-page">
        <FormsCatalogClient forms={forms} />
      </main>
    </>
  );
}
