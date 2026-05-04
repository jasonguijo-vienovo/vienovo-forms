import { Clock3, ExternalLink } from "lucide-react";
import Link from "next/link";
import { connectMongo } from "@/lib/db/mongo";
import { RequestModel } from "@/models/Request";

const STATUS_TONES: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-green-200 bg-green-50 text-green-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  returned: "border-blue-200 bg-blue-50 text-blue-800",
  submitted: "border-sky-200 bg-sky-50 text-sky-800",
};

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
      currentStep: 1,
      createdAt: 1,
    })
    .lean();

  return (
    <div className="admin-page">
      <div>
        <p className="section-eyebrow">Operations</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-surface-text">Admin queue</h1>
        <p className="mt-1 text-sm text-surface-muted">
          A single queue for submitted requests across native and imported forms.
        </p>
      </div>

      <section className="admin-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-surface-text">Latest requests</h2>
            <p className="mt-1 text-sm text-surface-muted">Showing the newest {requests.length} records.</p>
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="p-10 text-center text-sm text-surface-muted">No requests have been submitted yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-surface-border bg-slate-50 text-xs uppercase tracking-[0.08em] text-surface-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Reference</th>
                  <th className="px-5 py-3 font-semibold">Form</th>
                  <th className="px-5 py-3 font-semibold">Requester</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Submitted</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {requests.map((request) => (
                  <tr key={String(request._id)} className="bg-white transition hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs text-surface-text">{request.referenceNo}</span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-surface-text">
                        {request.formName || request.formSlug || request.formType}
                      </p>
                      <p className="mt-1 text-xs text-surface-muted">{request.formType}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-surface-text">{request.submittedBy?.name || "Requester"}</p>
                      <p className="mt-1 text-xs text-surface-muted">{request.submittedBy?.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`status-pill uppercase ${
                          STATUS_TONES[request.status] ?? "border-surface-border bg-slate-50 text-slate-700"
                        }`}
                      >
                        {request.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-surface-muted">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {new Date(String(request.createdAt)).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/requests/${request.referenceNo}`}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline"
                      >
                        Open
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
