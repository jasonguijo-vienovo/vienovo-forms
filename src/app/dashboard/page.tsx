import Link from "next/link";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { connectMongo } from "@/lib/db/mongo";
import { getCatalogForms } from "@/lib/form-definitions";
import { safeAuth } from "@/lib/safe-auth";
import { RequestModel } from "@/models/Request";
import { deleteDashboardRequest } from "./actions";

const FORM_LABELS: Record<string, string> = {
  "travel-booking": "Travel Booking",
  "cash-advance": "Cash Advance",
  reimbursement: "Reimbursement",
  "request-for-payment": "Request for Payment",
  cashiering: "Cashiering",
  imported: "Imported Form",
};

const STATUS_TONES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  returned: "bg-blue-100 text-blue-800 border-blue-200",
  submitted: "bg-sky-100 text-sky-800 border-sky-200",
};

export default async function DashboardPage() {
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");
  const name = session?.user?.name ?? session?.user?.email ?? "there";
  const userEmail = session.user.email.toLowerCase();
  const forms = await getCatalogForms({ allowFallback: true });
  await connectMongo();
  const [myRequests, pendingApprovals] = await Promise.all([
    RequestModel.find({ "submittedBy.email": userEmail }).sort({ createdAt: -1 }).limit(6).lean(),
    RequestModel.find({
      approvalChain: { $elemMatch: { approverEmail: userEmail, status: "pending" } },
    })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
  ]);

  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">
            Welcome, {String(name).split(" ")[0]}
          </h1>
          <p className="text-gray-500 mt-1">
            Submit a new request or check the status of your existing ones.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-4">
            Submit a request
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {forms.length > 0 ? (
              forms.map((form) => <FormCard key={form.slug} {...form} />)
            ) : (
              <div className="sm:col-span-2 lg:col-span-3 rounded-2xl border border-brand-100 bg-white p-6 text-sm text-gray-400 text-center">
                No available forms right now.
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="My recent requests">
            {myRequests.length > 0 ? (
              <div className="space-y-3">
                {myRequests.map((request) => (
                  <RequestRow key={String(request._id)} request={request} showDelete />
                ))}
              </div>
            ) : (
              <EmptyState message="You haven't submitted any requests yet." />
            )}
          </Panel>
          <Panel title="Pending my approval">
            {pendingApprovals.length > 0 ? (
              <div className="space-y-3">
                {pendingApprovals.map((request) => (
                  <RequestRow key={String(request._id)} request={request} />
                ))}
              </div>
            ) : (
              <EmptyState message="No pending approvals." />
            )}
          </Panel>
        </section>
      </main>
    </>
  );
}

function FormCard({
  slug,
  name,
  description,
  availability,
  isImplemented,
  routePath,
}: {
  slug: string;
  name: string;
  description: string;
  availability: "available" | "coming-soon";
  isImplemented: boolean;
  routePath: string;
}) {
  const available = availability === "available" && isImplemented;

  const inner = (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-brand-100 p-5 h-full transition ${
        available
          ? "hover:shadow-md hover:border-brand-300 cursor-pointer"
          : "opacity-60"
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-bold text-gray-800">{name}</h3>
        {!available && (
          <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            Soon
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  );

  return available ? <Link href={routePath || `/forms/${slug}`}>{inner}</Link> : inner;
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
      <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="text-center py-10 text-sm text-gray-400">{message}</div>;
}

function requestFormLabel(request: any) {
  if (request.formType === "imported") {
    return request.formData?.importedFormName || FORM_LABELS.imported;
  }
  return FORM_LABELS[request.formType] ?? request.formType;
}

function formatDate(value: unknown) {
  if (!value) return "";
  return new Date(String(value)).toLocaleString();
}

function RequestRow({ request, showDelete = false }: { request: any; showDelete?: boolean }) {
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/requests/${request.referenceNo}`} className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800 truncate">{requestFormLabel(request)}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            <span className="font-mono">{request.referenceNo}</span>
            {" · "}
            {formatDate(request.createdAt)}
          </p>
        </Link>
        <span
          className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
            STATUS_TONES[request.status] ?? "bg-gray-100 text-gray-700 border-gray-200"
          }`}
        >
          {request.status}
        </span>
      </div>
      {showDelete ? (
        <form action={deleteDashboardRequest} className="mt-3 flex justify-end">
          <input type="hidden" name="referenceNo" value={request.referenceNo} />
          <button
            type="submit"
            className="text-xs font-semibold text-red-700 border border-red-200 bg-white hover:bg-red-50 rounded-lg px-3 py-1.5 transition"
          >
            Delete request
          </button>
        </form>
      ) : null}
    </div>
  );
}
