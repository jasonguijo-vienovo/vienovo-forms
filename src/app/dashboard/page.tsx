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
import { Types } from "mongoose";
import { Navbar } from "@/components/navbar";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { connectMongo } from "@/lib/db/mongo";
import { getCatalogForms } from "@/lib/form-definitions";
import type { FormRuntimeState } from "@/lib/forms/runtime-state";
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    cursor?: string;
    pq?: string;
    pcursor?: string;
  }>;
}) {
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");
  const name = session?.user?.name ?? session?.user?.email ?? "there";
  const userEmail = session.user.email.toLowerCase();
  const resolvedSearchParams = await searchParams;
  const q = String(resolvedSearchParams?.q ?? "").trim();
  const statusFilter = String(resolvedSearchParams?.status ?? "all").trim().toLowerCase();
  const cursor = String(resolvedSearchParams?.cursor ?? "").trim();
  const pendingQuery = String(resolvedSearchParams?.pq ?? "").trim();
  const pendingCursor = String(resolvedSearchParams?.pcursor ?? "").trim();
  const pageSize = 10;
  const forms = await getCatalogForms({
    allowFallback: true,
    includeUnavailable: true,
    includeDrafts: true,
  });
  await connectMongo();
  const requestFilter: Record<string, unknown> = { "submittedBy.email": userEmail };
  if (["pending", "approved", "rejected", "returned", "submitted"].includes(statusFilter)) {
    requestFilter.status = statusFilter;
  }
  if (q) {
    requestFilter.$or = [
      { referenceNo: { $regex: q, $options: "i" } },
      { formName: { $regex: q, $options: "i" } },
      { formSlug: { $regex: q, $options: "i" } },
    ];
  }
  if (cursor) {
    const [cursorDateRaw, cursorIdRaw] = cursor.split("|");
    const cursorDate = new Date(cursorDateRaw || "");
    if (!Number.isNaN(cursorDate.getTime()) && Types.ObjectId.isValid(cursorIdRaw || "")) {
      requestFilter.$or = [
        ...(Array.isArray(requestFilter.$or) ? requestFilter.$or : []),
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: new Types.ObjectId(cursorIdRaw) } },
      ];
    }
  }
  const pendingFilter: Record<string, unknown> = {
    approvalChain: { $elemMatch: { approverEmail: userEmail, status: "pending" } },
  };
  if (pendingQuery) {
    pendingFilter.$or = [
      { referenceNo: { $regex: pendingQuery, $options: "i" } },
      { formName: { $regex: pendingQuery, $options: "i" } },
      { formSlug: { $regex: pendingQuery, $options: "i" } },
    ];
  }
  if (pendingCursor) {
    const [pendingCursorDateRaw, pendingCursorIdRaw] = pendingCursor.split("|");
    const pendingCursorDate = new Date(pendingCursorDateRaw || "");
    if (!Number.isNaN(pendingCursorDate.getTime()) && Types.ObjectId.isValid(pendingCursorIdRaw || "")) {
      pendingFilter.$or = [
        ...(Array.isArray(pendingFilter.$or) ? pendingFilter.$or : []),
        { createdAt: { $lt: pendingCursorDate } },
        { createdAt: pendingCursorDate, _id: { $lt: new Types.ObjectId(pendingCursorIdRaw) } },
      ];
    }
  }

  const [myRequests, pendingApprovals, myRequestCount, pendingApprovalsCount] = await Promise.all([
    RequestModel.find(requestFilter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(pageSize + 1)
      .select({
        _id: 1,
        referenceNo: 1,
        status: 1,
        createdAt: 1,
        formType: 1,
        formName: 1,
        formSlug: 1,
        currentRole: 1,
        currentActorName: 1,
        currentActorEmail: 1,
      })
      .lean(),
    RequestModel.find(pendingFilter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(pageSize + 1)
      .select({
        _id: 1,
        referenceNo: 1,
        status: 1,
        createdAt: 1,
        formType: 1,
        formName: 1,
        formSlug: 1,
        currentRole: 1,
        currentActorName: 1,
        currentActorEmail: 1,
      })
      .lean(),
    RequestModel.countDocuments({ "submittedBy.email": userEmail }),
    RequestModel.countDocuments({
      approvalChain: { $elemMatch: { approverEmail: userEmail, status: "pending" } },
    }),
  ]);
  const hasMore = myRequests.length > pageSize;
  const visibleRequests = hasMore ? myRequests.slice(0, pageSize) : myRequests;
  const lastVisible = visibleRequests[visibleRequests.length - 1];
  const nextCursor =
    hasMore && lastVisible?.createdAt && lastVisible?._id
      ? `${new Date(lastVisible.createdAt).toISOString()}|${String(lastVisible._id)}`
      : "";
  const pendingHasMore = pendingApprovals.length > pageSize;
  const visiblePendingApprovals = pendingHasMore ? pendingApprovals.slice(0, pageSize) : pendingApprovals;
  const pendingLastVisible = visiblePendingApprovals[visiblePendingApprovals.length - 1];
  const pendingNextCursor =
    pendingHasMore && pendingLastVisible?.createdAt && pendingLastVisible?._id
      ? `${new Date(pendingLastVisible.createdAt).toISOString()}|${String(pendingLastVisible._id)}`
      : "";

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-[1920px] px-3 py-6 sm:px-5 md:px-6 lg:px-8">
        <div className="mb-8 flex w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mx-auto lg:w-4/5">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {forms.length > 0 ? (
              forms.slice(0, 8).map((form) => <FormCard key={form.slug} {...form} />)
            ) : (
              <div className="app-panel p-8 text-center text-sm text-surface-muted sm:col-span-2 lg:col-span-3 2xl:col-span-4">
                No available request forms right now.
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="Recent requests" description="Latest forms you submitted.">
            <div className="mb-4 flex flex-col gap-2">
              <form className="flex flex-col gap-2 sm:flex-row" method="get">
                <input
                  type="text"
                  name="q"
                  defaultValue={q}
                  placeholder="Search reference or form"
                  className="field-input sm:max-w-xs"
                />
                <button type="submit" className="btn-secondary">Search</button>
              </form>
              <div className="flex flex-wrap gap-2">
                {["all", "pending", "approved", "rejected", "returned", "submitted"].map((status) => (
                  <Link
                    key={status}
                    href={`/dashboard?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                    className={`rounded border px-2 py-1 text-xs font-semibold ${
                      statusFilter === status
                        ? "border-brand-300 bg-brand-50 text-brand-700"
                        : "border-surface-border bg-white text-surface-muted"
                    }`}
                  >
                    {status === "all" ? "All" : status}
                  </Link>
                ))}
                <span className="text-xs text-surface-muted self-center">Total: {myRequestCount}</span>
              </div>
            </div>
            {visibleRequests.length > 0 ? (
              <div className="divide-y divide-surface-border">
                {visibleRequests.map((request) => (
                  <RequestRow key={String(request._id)} request={request} showDelete />
                ))}
              </div>
            ) : (
              <EmptyState message="You haven't submitted any requests yet." />
            )}
            {hasMore && nextCursor ? (
              <div className="mt-4">
                <Link
                  href={`/dashboard?cursor=${encodeURIComponent(nextCursor)}&status=${encodeURIComponent(statusFilter)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className="btn-secondary"
                >
                  Load more
                </Link>
              </div>
            ) : null}
          </Panel>
          <Panel title="Pending approvals" description="Requests waiting for your action.">
            <div className="mb-4 flex flex-col gap-2">
              <form className="flex flex-col gap-2 sm:flex-row" method="get">
                <input
                  type="text"
                  name="pq"
                  defaultValue={pendingQuery}
                  placeholder="Search pending approvals"
                  className="field-input sm:max-w-xs"
                />
                <button type="submit" className="btn-secondary">Search</button>
              </form>
              <span className="text-xs text-surface-muted">Total pending: {pendingApprovalsCount}</span>
            </div>
            {visiblePendingApprovals.length > 0 ? (
              <div className="divide-y divide-surface-border">
                {visiblePendingApprovals.map((request) => (
                  <RequestRow key={String(request._id)} request={request} />
                ))}
              </div>
            ) : (
              <EmptyState message="No pending approvals." />
            )}
            {pendingHasMore && pendingNextCursor ? (
              <div className="mt-4">
                <Link
                  href={`/dashboard?pcursor=${encodeURIComponent(pendingNextCursor)}${pendingQuery ? `&pq=${encodeURIComponent(pendingQuery)}` : ""}`}
                  className="btn-secondary"
                >
                  Load more
                </Link>
              </div>
            ) : null}
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
  status,
  availability,
  isImplemented,
  routePath,
  runtime,
}: {
  slug: string;
  name: string;
  description: string;
  status: "published" | "draft" | "archived";
  availability: "available" | "coming-soon";
  isImplemented: boolean;
  routePath: string;
  runtime: FormRuntimeState;
}) {
  const available = runtime.requesterCanOpen;
  const Icon = formIcon(slug);
  const badgeText = status !== "published" ? "Pending" : "Soon";

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
          <span className="status-pill border-surface-border bg-slate-50 text-surface-muted">{badgeText}</span>
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
  const date = new Date(String(value));
  const relativeMs = Date.now() - date.getTime();
  const relativeHours = Math.floor(relativeMs / (1000 * 60 * 60));
  const relative =
    relativeHours < 1
      ? "just now"
      : relativeHours < 24
        ? `${relativeHours}h ago`
        : `${Math.floor(relativeHours / 24)}d ago`;
  return `${relative} • ${date.toLocaleString()}`;
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
          {request.status === "pending" && (request.currentRole || request.currentActorName) ? (
            <p className="mt-1 text-xs text-surface-muted">
              Current step: {request.currentRole || "pending"} {request.currentActorName ? `• ${request.currentActorName}` : ""}
            </p>
          ) : null}
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


