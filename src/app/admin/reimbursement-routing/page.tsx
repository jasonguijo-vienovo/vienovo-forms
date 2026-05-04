import { connectMongo } from "@/lib/db/mongo";
import { ReimbursementRoute } from "@/models/ReimbursementRoute";
import { ReimbursementRoutingClient } from "./ReimbursementRoutingClient";

export default async function ReimbursementRoutingPage() {
  await connectMongo();
  const routes = await ReimbursementRoute.find({})
    .sort({ department: 1, costCenter: 1, location: 1 })
    .lean();

  return (
    <ReimbursementRoutingClient
      routes={routes.map((route) => ({
        _id: String(route._id),
        department: route.department,
        costCenter: route.costCenter,
        location: route.location,
        supervisorEmail: route.supervisorEmail || "",
        supervisorName: route.supervisorName || "",
        headEmail: route.headEmail || "",
        headName: route.headName || "",
        isActive: route.isActive,
      }))}
    />
  );
}
