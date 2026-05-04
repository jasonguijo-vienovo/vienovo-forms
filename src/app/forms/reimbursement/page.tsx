import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { Navbar } from "@/components/navbar";
import { connectMongo } from "@/lib/db/mongo";
import { Lookup } from "@/models/Lookup";
import { Approver } from "@/models/Approver";
import { ReimbursementRoute } from "@/models/ReimbursementRoute";
import { getEmployeeByEmail } from "@/lib/employee";
import { ReimbursementForm } from "./form";
import { submitReimbursement } from "./actions";
import { RequestModel } from "@/models/Request";

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

export default async function ReimbursementPage() {
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");

  await connectMongo();

  const [formTypes, liquidationTypes, routes, supervisors, heads, employee] =
    await Promise.all([
      Lookup.find({ category: "reimbursementFormType", isActive: true })
        .sort({ sortOrder: 1, value: 1 })
        .lean(),
      Lookup.find({ category: "reimbursementLiquidationType", isActive: true })
        .sort({ sortOrder: 1, value: 1 })
        .lean(),
      ReimbursementRoute.find({ isActive: true })
        .sort({ sortOrder: 1, department: 1, costCenter: 1, location: 1 })
        .lean(),
      Approver.find({ roles: "supervisor", isActive: true }).sort({ name: 1 }).lean(),
      Approver.find({ roles: "head", isActive: true }).sort({ name: 1 }).lean(),
      getEmployeeByEmail(session.user.email),
    ]);

  const userEmail = session.user.email.toLowerCase();
  const userName = session.user.name ?? "";
  const nameParts = splitName(employee?.fullName || userName);

  const cashAdvanceRefs = await RequestModel.find({
    formType: "cash-advance",
    "submittedBy.email": userEmail,
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .select({ referenceNo: 1 })
    .lean();

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <ReimbursementForm
          user={{ email: userEmail, name: userName }}
          submitAction={submitReimbursement}
          prefill={{
            firstName: nameParts.firstName,
            lastName: nameParts.lastName,
            department: employee?.department ?? "",
            supervisorEmail: employee?.supervisorEmail ?? "",
            departmentHeadEmail: employee?.departmentHeadEmail ?? "",
          }}
          routes={routes.map((r) => ({
            id: String(r._id),
            department: r.department,
            costCenter: r.costCenter,
            location: r.location,
            supervisorEmail: r.supervisorEmail,
            supervisorName: r.supervisorName,
            headEmail: r.headEmail,
            headName: r.headName,
          }))}
          formTypeOptions={formTypes.map((t) => t.value)}
          cashAdvanceReferenceOptions={cashAdvanceRefs.map((d) => d.referenceNo)}
          liquidationTypeOptions={liquidationTypes.map((l) => l.value)}
          supervisors={supervisors.map((s) => ({
            id: String(s._id),
            name: s.name,
            email: s.email,
          }))}
          heads={heads.map((h) => ({
            id: String(h._id),
            name: h.name,
            email: h.email,
          }))}
        />
      </main>
    </>
  );
}
