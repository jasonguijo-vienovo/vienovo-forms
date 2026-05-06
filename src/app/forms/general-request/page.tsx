import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin";
import { safeAuth } from "@/lib/safe-auth";
import { Navbar } from "@/components/navbar";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
import { getFormUserAccess } from "@/lib/forms/runtime-state";
import { GeneralRequestForm } from "./form";
import { submitGeneralRequest } from "./actions";

export default async function GeneralRequestPage({ searchParams }: { searchParams?: Promise<{ preview?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");

  const definition = await getFormDefinitionBySlug("general-request");
  if (!definition) redirect("/forms");

  const isAdmin = await isAdminUser(session.user.email);
  const requesterPreview = isAdmin && resolvedSearchParams?.preview === "requester";
  const access = getFormUserAccess(definition, { isAdmin, requesterPreview });
  if (!access.canOpen) redirect("/dashboard");

  return (
    <>
      <Navbar
        adminShortcut={
          isAdmin
            ? {
                href: requesterPreview ? "/forms/general-request" : "/forms/general-request?preview=requester",
                label: requesterPreview ? "Admin view" : "Requester preview",
              }
            : null
        }
      />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <GeneralRequestForm
          user={{
            email: session.user.email.toLowerCase(),
            name: session.user.name ?? session.user.email,
          }}
          submitAction={submitGeneralRequest}
        />
      </main>
    </>
  );
}
