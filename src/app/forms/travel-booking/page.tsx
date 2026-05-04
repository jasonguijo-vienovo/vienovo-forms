import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { Navbar } from "@/components/navbar";
import { connectMongo } from "@/lib/db/mongo";
import { Lookup } from "@/models/Lookup";
import { Approver } from "@/models/Approver";
import { getEmployeeByEmail } from "@/lib/employee";
import { TravelBookingForm } from "./form";
import { submitTravelBooking } from "./actions";

export default async function TravelBookingPage() {
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");

  await connectMongo();

  const [
    departments,
    airports,
    multiCityDepartures,
    airlines,
    baggage,
    supervisors,
    heads,
    prefill,
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
    getEmployeeByEmail(session.user.email),
  ]);

  const userEmail = session.user.email.toLowerCase();
  const userName = session.user.name ?? "";

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <TravelBookingForm
          user={{ email: userEmail, name: userName }}
          submitAction={submitTravelBooking}
          prefill={
            prefill ?? {
              employeeId: "",
              fullName: "",
              department: "",
              birthday: "",
              contactNumber: "",
              supervisorEmail: "",
              departmentHeadEmail: "",
            }
          }
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
