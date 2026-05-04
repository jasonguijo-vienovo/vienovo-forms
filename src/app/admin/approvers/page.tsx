import { connectMongo } from "@/lib/db/mongo";
import { Approver, APPROVER_ROLES } from "@/models/Approver";
import { ApproversClient } from "./ApproversClient";

export default async function ApproversPage() {
  await connectMongo();
  const all = await Approver.find({}).sort({ name: 1 }).lean();

  return (
    <ApproversClient
      approvers={all.map((item) => ({
        _id: String(item._id),
        name: item.name,
        email: item.email,
        roles: item.roles,
        isActive: item.isActive,
        emailNeedsReview: item.emailNeedsReview,
        department: item.department || "",
      }))}
      roles={[...APPROVER_ROLES]}
    />
  );
}
