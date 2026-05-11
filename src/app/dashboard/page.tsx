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
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { SmoothPageLink } from "@/components/smooth-page-link";
import { connectMongo } from "@/lib/db/mongo";
import { getCatalogForms, getFormLaunchHref, isExternalFormLaunch } from "@/lib/form-definitions";
import type { FormRuntimeState } from "@/lib/forms/runtime-state";
import { safeAuth } from "@/lib/safe-auth";
import { RequestModel } from "@/models/Request";

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
    page?: string;
    pq?: string;
    ppage?: string;
  }>;
}) {
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");
  const name = session?.user?.name ?? session?.user?.email ?? "there";
  const userEmail = session.user.email.toLowerCase();
  const resolvedSearchParams = await searchParams;
  const q = String(resolvedSearchParams?.q ?? "").trim();
  const statusFilter = String(resolvedSearchParams?.status ?? "all").trim().toLowerCase();
  const page = Math.max(1, Number.parseInt(String(resolvedSearchParams?.page ?? "1"), 10) || 1);
  const pendingQuery = String(resolvedSearchParams?.pq ?? "").trim();
  const pendingPage = Math.max(1, Number.parseInt(String(resolvedSearchParams?.ppage ?? "1"), 10) || 1);
  const pageSize = 5;
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
  const pendingOwnershipFilter = {
    $or: [
      { currentActorEmail: userEmail },
      { approvalChain: { $elemMatch: { approverEmail: userEmail, status: "pending" } } },
    ],
  };
  const pendingFilter: Record<string, unknown> = {
    status: "pending",
    ...pendingOwnershipFilter,
  };
  if (pendingQuery) {
    pendingFilter.$and = [
      pendingOwnershipFilter,
      {
        $or: [
          { referenceNo: { $regex: pendingQuery, $options: "i" } },
          { formName: { $regex: pendingQuery, $options: "i" } },
          { formSlug: { $regex: pendingQuery, $options: "i" } },
        ],
      },
    ];
  }

  const [myRequests, pendingApprovals, myRequestCount, pendingApprovalsCount] = await Promise.all([
    RequestModel.find(requestFilter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
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
      .skip((pendingPage - 1) * pageSize)
      .limit(pageSize)
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
    RequestModel.countDocuments(pendingFilter),
  ]);
  const visibleRequests = myRequests;
  const totalPages = Math.max(1, Math.ceil(myRequestCount / pageSize));
  const hasPrevPage = page > 1;
  const hasNextPage = page < totalPages;
  const pendingTotalPages = Math.max(1, Math.ceil(pendingApprovalsCount / pageSize));
  const pendingHasPrevPage = pendingPage > 1;
  const pendingHasNextPage = pendingPage < pendingTotalPages;
  const visiblePendingApprovals = pendingApprovals;

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
                  <RequestRow key={String(request._id)} request={request} />
                ))}
              </div>
            ) : (
              <EmptyState message="You haven't submitted any requests yet." />
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-xs text-surface-muted">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <SmoothPageLink href={`/dashboard?page=${Math.max(1, page - 1)}&status=${encodeURIComponent(statusFilter)}${q ? `&q=${encodeURIComponent(q)}` : ""}`} disabled={!hasPrevPage} aria-disabled={!hasPrevPage} className={`btn-secondary ${hasPrevPage ? "" : "pointer-events-none opacity-50"}`} direction="previous">
                  Previous
                </SmoothPageLink>
                <SmoothPageLink href={`/dashboard?page=${Math.min(totalPages, page + 1)}&status=${encodeURIComponent(statusFilter)}${q ? `&q=${encodeURIComponent(q)}` : ""}`} disabled={!hasNextPage} aria-disabled={!hasNextPage} className={`btn-secondary ${hasNextPage ? "" : "pointer-events-none opacity-50"}`} direction="next">
                  Next
                </SmoothPageLink>
              </div>
            </div>
          </Panel>
          <div id="pending-approvals">
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
            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-xs text-surface-muted">
                Page {pendingPage} of {pendingTotalPages}
              </span>
              <div className="flex gap-2">
                <SmoothPageLink
                  href={`/dashboard?ppage=${Math.max(1, pendingPage - 1)}${pendingQuery ? `&pq=${encodeURIComponent(pendingQuery)}` : ""}`}
                  disabled={!pendingHasPrevPage}
                  aria-disabled={!pendingHasPrevPage}
                  className={`btn-secondary ${pendingHasPrevPage ? "" : "pointer-events-none opacity-50"}`}
                  direction="previous"
                >
                  Previous
                </SmoothPageLink>
                <SmoothPageLink
                  href={`/dashboard?ppage=${Math.min(pendingTotalPages, pendingPage + 1)}${pendingQuery ? `&pq=${encodeURIComponent(pendingQuery)}` : ""}`}
                  disabled={!pendingHasNextPage}
                  aria-disabled={!pendingHasNextPage}
                  className={`btn-secondary ${pendingHasNextPage ? "" : "pointer-events-none opacity-50"}`}
                  direction="next"
                >
                  Next
                </SmoothPageLink>
              </div>
            </div>
          </Panel>
          </div>
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
  externalFormUrl,
  runtime,
}: {
  slug: string;
  name: string;
  description: string;
  status: "published" | "draft" | "archived";
  availability: "available" | "coming-soon";
  isImplemented: boolean;
  routePath: string;
  externalFormUrl: string;
  runtime: FormRuntimeState;
}) {
  const available = runtime.requesterCanOpen;
  const Icon = formIcon(slug);
  const badgeText = status !== "published" ? "Pending" : "Soon";
  const href = getFormLaunchHref({ slug, routePath, externalFormUrl });
  const isExternal = isExternalFormLaunch({ externalFormUrl });

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

  if (!available) return inner;
  return isExternal ? (
    <a href={href} className="block">
      {inner}
    </a>
  ) : (
    <Link href={href}>{inner}</Link>
  );
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

function RequestRow({ request }: { request: any }) {
  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <Link href={`/requests/${request.referenceNo}`} className="min-w-0 block">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-surface-text">{requestFormLabel(request)}</p>
          <span
            className={`status-pill shrink-0 uppercase ${
              STATUS_TONES[request.status] ?? "border-surface-border bg-slate-50 text-slate-700"
            }`}
          >
            {request.status}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-surface-muted">
          <Clock3 className="h-3.5 w-3.5" />
          <span className="font-mono">{request.referenceNo}</span>
          {" - "}
          {formatDate(request.createdAt)}
        </p>
      </Link>
    </div>
  );
}





