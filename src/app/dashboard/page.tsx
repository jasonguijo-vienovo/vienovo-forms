import {
  ArrowRight,
  Banknote,
  Building2,
  Clock3,
  FileText,
  Laptop,
  Megaphone,
  Plane,
  Plus,
  ReceiptText,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { PendingSubmitButton } from "@/components/pending-submit-button";
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
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-green-200 bg-green-50 text-green-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  returned: "border-blue-200 bg-blue-50 text-blue-800",
  submitted: "border-sky-200 bg-sky-50 text-sky-800",
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
      <main className="app-page">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-eyebrow">Requester workspace</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-surface-text">
              Welcome, {String(name).split(" ")[0]}
            </h1>
            <p className="mt-1 text-sm text-surface-muted">
              Start a request, track your submissions, and see approvals waiting for you.
            </p>
          </div>
          <Link href="/forms" className="btn-primary w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            New Request
          </Link>
        </div>

        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-surface-text">Quick request forms</h2>
            <Link href="/forms" className="text-sm font-semibold text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {forms.length > 0 ? (
              forms.slice(0, 4).map((form) => <FormCard key={form.slug} {...form} />)
            ) : (
              <div className="app-panel p-8 text-center text-sm text-surface-muted sm:col-span-2">
                No available request forms right now.
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title="Recent requests" description="Latest forms you submitted.">
            {myRequests.length > 0 ? (
              <div className="divide-y divide-surface-border">
                {myRequests.map((request) => (
                  <RequestRow key={String(request._id)} request={request} showDelete />
                ))}
              </div>
            ) : (
              <EmptyState message="You haven't submitted any requests yet." />
            )}
          </Panel>
          <Panel title="Pending approvals" description="Requests waiting for your action.">
            {pendingApprovals.length > 0 ? (
              <div className="divide-y divide-surface-border">
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

function formIcon(slug: string) {
  if (slug.includes("travel")) return Plane;
  if (slug.includes("cash")) return Banknote;
  if (slug.includes("reimbursement")) return ReceiptText;
  if (slug.includes("payment")) return Building2;
  if (slug.includes("tell") || slug.includes("help")) return Megaphone;
  if (slug.includes("it")) return Laptop;
  return FileText;
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
  const Icon = formIcon(slug);

  const inner = (
    <div
      className={`app-panel group h-full p-5 transition ${
        available ? "hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm" : "opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-surface-text">{name}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-surface-muted">{description}</p>
          </div>
        </div>
        {available ? (
          <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-brand-700" />
        ) : (
          <span className="status-pill border-surface-border bg-slate-50 text-surface-muted">Soon</span>
        )}
      </div>
    </div>
  );

  return available ? <Link href={routePath || `/forms/${slug}`}>{inner}</Link> : inner;
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-panel overflow-hidden">
      <div className="border-b border-surface-border px-5 py-4">
        <h2 className="text-base font-semibold text-surface-text">{title}</h2>
        <p className="mt-1 text-sm text-surface-muted">{description}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="py-10 text-center text-sm text-surface-muted">{message}</div>;
}

function requestFormLabel(request: any) {
  if (request.formName) return String(request.formName);
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
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/requests/${request.referenceNo}`} className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-surface-text">{requestFormLabel(request)}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-surface-muted">
            <Clock3 className="h-3.5 w-3.5" />
            <span className="font-mono">{request.referenceNo}</span>
            {" - "}
            {formatDate(request.createdAt)}
          </p>
        </Link>
        <span
          className={`status-pill shrink-0 uppercase ${
            STATUS_TONES[request.status] ?? "border-surface-border bg-slate-50 text-slate-700"
          }`}
        >
          {request.status}
        </span>
      </div>
      {showDelete ? (
        <form action={deleteDashboardRequest} className="mt-3 flex justify-end">
          <input type="hidden" name="referenceNo" value={request.referenceNo} />
          <PendingSubmitButton
            type="submit"
            idleLabel={
              <span className="inline-flex items-center gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete request</span>
              </span>
            }
            pendingLabel="Deleting..."
            className="inline-flex items-center gap-1.5 border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
          />
        </form>
      ) : null}
    </div>
  );
}
