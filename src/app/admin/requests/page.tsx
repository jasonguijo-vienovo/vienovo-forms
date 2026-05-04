import { connectMongo } from "@/lib/db/mongo";
import { RequestModel } from "@/models/Request";
import { RequestsClient } from "./RequestsClient";

export default async function AdminRequestsPage() {
  await connectMongo();
  const requests = await RequestModel.find({})
    .sort({ createdAt: -1 })
    .limit(75)
    .select({
      referenceNo: 1,
      formType: 1,
      formSlug: 1,
      formName: 1,
      submittedBy: 1,
      status: 1,
      createdAt: 1,
    })
    .lean();

  return (
    <RequestsClient
      requests={requests.map((request) => ({
        _id: String(request._id),
        referenceNo: request.referenceNo,
        formType: request.formType,
        formSlug: request.formSlug,
        formName: request.formName,
        submittedBy: request.submittedBy ?? undefined,
        status: request.status,
        createdAt: String(request.createdAt),
      }))}
    />
  );
}
