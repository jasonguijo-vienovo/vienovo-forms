import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin";
import { safeAuth } from "@/lib/safe-auth";
import { Navbar } from "@/components/navbar";
import { connectMongo } from "@/lib/db/mongo";
import { Lookup } from "@/models/Lookup";
import { Approver } from "@/models/Approver";
import { getEmployeeByEmail } from "@/lib/employee";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
import { getFormUserAccess } from "@/lib/forms/runtime-state";
import { CashAdvanceForm } from "./form";
import { submitCashAdvance } from "./actions";

function splitName(fullName: string) {
  const clean = String(fullName || "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "", lastName: "" };
  const parts = clean.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

export default async function CashAdvancePage({
  searchParams,
}: {
  searchParams?: Promise<{ preview?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");
  const definition = await getFormDefinitionBySlug("cash-advance");
  if (!definition) redirect("/forms");
  const isAdmin = await isAdminUser(session.user.email);
  const requesterPreview = isAdmin && resolvedSearchParams?.preview === "requester";
  const access = getFormUserAccess(definition, { isAdmin, requesterPreview });
  if (!access.canOpen) redirect("/dashboard");

  await connectMongo();

  const [payablesTo, approvers, employee] = await Promise.all([
    Lookup.find({ category: "cashAdvancePayableTo", isActive: true })
      .sort({ sortOrder: 1, value: 1 })
      .lean(),
    Approver.find({ roles: "cashAdvanceApprover", isActive: true })
      .sort({ name: 1 })
      .lean(),
    getEmployeeByEmail(session.user.email),
  ]);

  const userEmail = session.user.email.toLowerCase();
  const userName = session.user.name ?? "";
  const nameParts = splitName(employee?.fullName || userName);

  return (
    <>
      <Navbar
        adminShortcut={
          isAdmin
            ? {
                href: requesterPreview
                  ? "/forms/cash-advance"
                  : "/forms/cash-advance?preview=requester",
                label: requesterPreview ? "Admin view" : "Requester preview",
              }
            : null
        }
      />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <CashAdvanceForm
          user={{ email: userEmail, name: userName }}
          prefill={{
            firstName: nameParts.firstName,
            lastName: nameParts.lastName,
          }}
          payableToOptions={payablesTo.map((p) => ({ value: p.value, label: p.label || p.value }))}
          approvers={approvers.map((a) => ({
            id: String(a._id),
            name: a.name,
            email: a.email,
          }))}
          submitAction={submitCashAdvance}
        />
      </main>
    </>
  );
}


