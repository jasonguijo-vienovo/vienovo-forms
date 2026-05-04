import { notFound, redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { Navbar } from "@/components/navbar";
import { connectMongo } from "@/lib/db/mongo";
import { Lookup } from "@/models/Lookup";
import { Approver } from "@/models/Approver";
import { RequestModel } from "@/models/Request";
import { ReimbursementRoute } from "@/models/ReimbursementRoute";
import { getEmployeeByEmail } from "@/lib/employee";
import { TravelBookingForm, type TravelBookingInitialValues } from "@/app/forms/travel-booking/form";
import { updateTravelBooking } from "@/app/forms/travel-booking/actions";
import { CashAdvanceForm, type CashAdvanceInitialValues } from "@/app/forms/cash-advance/form";
import { updateCashAdvance } from "@/app/forms/cash-advance/actions";
import { ReimbursementForm, type ReimbursementInitialValues } from "@/app/forms/reimbursement/form";
import { updateReimbursement } from "@/app/forms/reimbursement/actions";

function isoDate(v: unknown) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

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

export default async function EditRequestPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");
  const userEmail = session.user.email.toLowerCase();

  await connectMongo();
  const doc = await RequestModel.findOne({ referenceNo: ref }).lean();
  if (!doc) notFound();
  if (doc.submittedBy?.email?.toLowerCase() !== userEmail) redirect(`/requests/${ref}`);

  const fd = (doc as any).formData ?? {};
  const userName = session.user.name ?? "";

  if (doc.formType === "travel-booking") {
    const [
      departments,
      airports,
      multiCityDepartures,
      airlines,
      baggage,
      supervisors,
      heads,
      employee,
    ] = await Promise.all([
      Lookup.find({ category: "department", isActive: true })
        .sort({ sortOrder: 1, value: 1 })
        .lean(),
      Lookup.find({ category: "airport", isActive: true })
        .sort({ sortOrder: 1, value: 1 })
        .lean(),
      Lookup.find({ category: "multiCityDeparture", isActive: true })
        .sort({ sortOrder: 1, value: 1 })
        .lean(),
      Lookup.find({ category: "airline", isActive: true })
        .sort({ sortOrder: 1, value: 1 })
        .lean(),
      Lookup.find({ category: "baggage", isActive: true })
        .sort({ sortOrder: 1, value: 1 })
        .lean(),
      Approver.find({ roles: "supervisor", isActive: true }).sort({ name: 1 }).lean(),
      Approver.find({ roles: "head", isActive: true }).sort({ name: 1 }).lean(),
      getEmployeeByEmail(userEmail),
    ]);

    const supervisorEmail =
      doc.approvalChain?.find((s) => s.role === "supervisor")?.approverEmail ?? "";
    const headEmail =
      doc.approvalChain?.find((s) => s.role === "head")?.approverEmail ?? "";

    const prefill = {
      employeeId: fd.employeeId ?? employee?.employeeId ?? "",
      fullName: fd.fullName ?? employee?.fullName ?? session.user.name ?? "",
      department: fd.department ?? employee?.department ?? "",
      birthday: isoDate(fd.birthday) || employee?.birthday || "",
      contactNumber: fd.contactNumber ?? employee?.contactNumber ?? "",
      supervisorEmail: supervisorEmail || employee?.supervisorEmail || "",
      departmentHeadEmail: headEmail || employee?.departmentHeadEmail || "",
    };

    const initial: TravelBookingInitialValues = {
      landAir: fd.landAir ?? "",
      tripType: fd.tripType ?? "roundtrip",
      origin: fd.origin ?? "",
      destination: fd.destination ?? "",
      departureDate: isoDate(fd.departureDate),
      returnDate: isoDate(fd.returnDate),
      preferredTime: fd.preferredTime ?? "",
      mc1Origin: fd.multiCity?.trip1?.origin ?? "",
      mc1Destination: fd.multiCity?.trip1?.destination ?? "",
      mc1Date: isoDate(fd.multiCity?.trip1?.date),
      mc1Time: fd.multiCity?.trip1?.time ?? "",
      mc2Origin: fd.multiCity?.trip2?.origin ?? "",
      mc2Destination: fd.multiCity?.trip2?.destination ?? "",
      mc2Date: isoDate(fd.multiCity?.trip2?.date),
      mc2Time: fd.multiCity?.trip2?.time ?? "",
      airline: fd.airline ?? "",
      travelPurpose: fd.travelPurpose ?? "",
      baggage: fd.baggage ?? "",
      hotelAccommodation: fd.hotelAccommodation ?? "",
      hotelOther: fd.hotelOther ?? "",
      servicePickup: fd.servicePickup ?? "",
    };

    const action = updateTravelBooking.bind(null, ref);

    return (
      <>
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <TravelBookingForm
            user={{ email: userEmail, name: userName }}
            prefill={prefill}
            initial={initial}
            submitAction={action}
            submitLabel="Save changes"
            departments={departments.map((d) => d.value)}
            airports={airports.map((a) => a.value)}
            multiCityDepartures={multiCityDepartures.map((m) => m.value)}
            airlines={airlines.map((a) => a.value)}
            baggageOptions={baggage.map((b) => b.value)}
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

  if (doc.formType === "cash-advance") {
    const [payablesTo, approvers, employee] = await Promise.all([
      Lookup.find({ category: "cashAdvancePayableTo", isActive: true })
        .sort({ sortOrder: 1, value: 1 })
        .lean(),
      Approver.find({ roles: "cashAdvanceApprover", isActive: true })
        .sort({ name: 1 })
        .lean(),
      getEmployeeByEmail(userEmail),
    ]);

    const nameParts = splitName(employee?.fullName || userName);
    const prefill = {
      firstName: fd.firstName ?? nameParts.firstName,
      lastName: fd.lastName ?? nameParts.lastName,
    };

    const initial: CashAdvanceInitialValues = {
      payablesTo: fd.payablesTo ?? "",
      payeeName: fd.payeeName ?? "",
      amount: fd.amount != null ? String(fd.amount) : "",
      reason: fd.reason ?? "",
      forApprovalNote: fd.forApprovalNote ?? "",
    };

    const action = updateCashAdvance.bind(null, ref);

    return (
      <>
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <CashAdvanceForm
            user={{ email: userEmail, name: userName }}
            prefill={prefill}
            initial={initial}
            payableToOptions={payablesTo.map((p) => p.value)}
            approvers={approvers.map((a) => ({
              id: String(a._id),
              name: a.name,
              email: a.email,
            }))}
            submitAction={action}
            submitLabel="Save changes"
          />
        </main>
      </>
    );
  }

  if (doc.formType === "reimbursement") {
    const [
      formTypes,
      liquidationTypes,
      routes,
      cashAdvanceRefs,
      supervisors,
      heads,
      employee,
    ] = await Promise.all([
      Lookup.find({ category: "reimbursementFormType", isActive: true })
        .sort({ sortOrder: 1, value: 1 })
        .lean(),
      Lookup.find({ category: "reimbursementLiquidationType", isActive: true })
        .sort({ sortOrder: 1, value: 1 })
        .lean(),
      ReimbursementRoute.find({ isActive: true })
        .sort({ sortOrder: 1, department: 1, costCenter: 1, location: 1 })
        .lean(),
      RequestModel.find({
        formType: "cash-advance",
        "submittedBy.email": userEmail,
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .select({ referenceNo: 1 })
        .lean(),
      Approver.find({ roles: "supervisor", isActive: true }).sort({ name: 1 }).lean(),
      Approver.find({ roles: "head", isActive: true }).sort({ name: 1 }).lean(),
      getEmployeeByEmail(userEmail),
    ]);

    const supervisorEmail =
      doc.approvalChain?.find((s) => s.role === "supervisor")?.approverEmail ?? "";
    const headEmail =
      doc.approvalChain?.find((s) => s.role === "head")?.approverEmail ?? "";

    const nameParts = splitName(employee?.fullName || userName);

    const prefill = {
      firstName: fd.firstName ?? nameParts.firstName,
      lastName: fd.lastName ?? nameParts.lastName,
      department: fd.department ?? employee?.department ?? "",
      supervisorEmail: supervisorEmail || employee?.supervisorEmail || "",
      departmentHeadEmail: headEmail || employee?.departmentHeadEmail || "",
    };

    const initial: ReimbursementInitialValues = {
      firstName: fd.firstName ?? "",
      lastName: fd.lastName ?? "",
      department: fd.department ?? "",
      costCenter: fd.costCenter ?? "",
      location: fd.location ?? "",
      formType: fd.formType ?? "",
      cashAdvanceReferenceNo: fd.cashAdvanceReferenceNo ?? "",
      reason: fd.reason ?? "",
      dateFrom: isoDate(fd.dateFrom),
      dateTo: isoDate(fd.dateTo),
      liquidationType: fd.liquidationType ?? "",
      transactionNumber: fd.transactionNumber ?? "",
      psNumber: fd.psNumber ?? "",
      businessPartner: fd.businessPartner ?? "",
      jvNo: fd.jvNo ?? "",
      expensesByCode: fd.expensesByCode ?? {},
      supportingFileName: fd.supportingDocument?.fileName ?? fd.supportingFileName ?? "",
      agreed: true,
    };

    const action = updateReimbursement.bind(null, ref);

    return (
      <>
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <ReimbursementForm
            user={{ email: userEmail, name: userName }}
            prefill={prefill}
            initial={initial}
            submitAction={action}
            submitLabel="Save changes"
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

  notFound();
}
