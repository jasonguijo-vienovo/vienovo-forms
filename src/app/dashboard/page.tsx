import { ArrowRight, Banknote, Building2, FileText, Laptop, Megaphone, Plane, Plus, ReceiptText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { getCatalogForms, getFormLaunchHref, isExternalFormLaunch } from "@/lib/form-definitions";
import type { FormRuntimeState } from "@/lib/forms/runtime-state";
import { safeAuth } from "@/lib/safe-auth";
import { DashboardPanels } from "./DashboardPanels";
import { fetchMyRequests, fetchPendingApprovals } from "./actions";

export default async function DashboardPage() {
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");
  const name = session?.user?.name ?? session?.user?.email ?? "there";
  const userEmail = session.user.email.toLowerCase();
  const forms = await getCatalogForms({
    allowFallback: true,
    includeUnavailable: true,
    includeDrafts: true,
  });

  const [initialRequests, initialPending] = await Promise.all([
    fetchMyRequests(userEmail, "all", "", 1),
    fetchPendingApprovals(userEmail, "", 1),
  ]);

  const readyFormCount = forms.filter((form) => form.runtime.requesterCanOpen).length;

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-[1920px] px-3 py-6 sm:px-5 md:px-6 lg:px-8">
        <section className="app-panel mb-8 overflow-hidden border-brand-100 bg-white/90">
          <div className="border-b border-brand-100 bg-gradient-to-r from-brand-700 via-brand-700 to-brand-600 px-5 py-6 text-white sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
                  Requester workspace
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Welcome, {String(name).split(" ")[0]}
                </h1>
                <p className="mt-2 text-sm leading-6 text-white/85">
                  Start a request, see where your submissions are stuck, and catch any approvals that need your action without hopping between unrelated screens.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link href="/forms" className="btn-primary min-w-[180px] justify-center border-white/20 bg-white text-brand-700 hover:bg-white/90">
                  <Plus className="h-4 w-4" />
                  Start a request
                </Link>
                <Link href="#pending-approvals" className="btn-secondary min-w-[180px] justify-center border-white/20 bg-white/10 text-white hover:bg-white/15">
                  Review approvals
                </Link>
              </div>
            </div>
          </div>
          <div className="grid gap-4 px-5 py-5 sm:grid-cols-3 sm:px-6">
            <SummaryStat label="Forms ready now" value={readyFormCount} hint="Catalog entries you can open today" />
            <SummaryStat label="My requests" value={initialRequests.total} hint="Submitted items across all statuses" />
            <SummaryStat label="Needs my attention" value={initialPending.total} hint="Approvals and tracked items worth checking" />
          </div>
        </section>

        <section className="mb-8">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-eyebrow">Start here</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-surface-text">Quick request forms</h2>
              <p className="mt-1 text-sm text-surface-muted">
                Use the most common forms below, or open the full catalog when you need something less frequent.
              </p>
            </div>
            <Link href="/forms" className="text-sm font-semibold text-brand-700 hover:underline">
              View full catalog
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

        <DashboardPanels
          userEmail={userEmail}
          initialRequests={initialRequests.items}
          initialRequestTotal={initialRequests.total}
          initialPending={initialPending.items}
          initialPendingTotal={initialPending.total}
        />
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
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-brand-50 text-brand-700 ring-1 ring-brand-100">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-surface-text">{name}</h3>
                <span className={`status-pill ${available ? "border-green-200 bg-green-50 text-green-800" : "border-surface-border bg-slate-50 text-surface-muted"}`}>
                  {available ? "Available now" : badgeText}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-surface-muted">{description}</p>
            </div>
          </div>
          {available ? (
            <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-brand-700" />
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-brand-700">
            {available ? "Start request" : availability === "coming-soon" || !isImplemented ? "Planned next" : "Needs setup"}
          </span>
          {isExternal ? <span className="text-xs text-surface-muted">External launch</span> : null}
        </div>
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

function SummaryStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-[0.875rem] border border-surface-border bg-slate-50/70 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-surface-text">{value}</p>
      <p className="mt-1 text-xs text-surface-muted">{hint}</p>
    </div>
  );
}
