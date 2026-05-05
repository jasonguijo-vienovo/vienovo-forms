import {
  ArrowRight,
  Banknote,
  Building2,
  FileText,
  Laptop,
  Megaphone,
  Plane,
  ReceiptText,
  Search,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { getCatalogForms } from "@/lib/form-definitions";
import type { FormRuntimeState } from "@/lib/forms/runtime-state";
import { safeAuth } from "@/lib/safe-auth";

export default async function FormsIndexPage() {
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");
  const forms = await getCatalogForms({
    allowFallback: true,
    includeUnavailable: true,
    includeDrafts: true,
  });

  return (
    <>
      <Navbar />
      <main className="app-page">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-eyebrow">Request catalog</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-surface-text">Available forms</h1>
            <p className="mt-1 text-sm text-surface-muted">Choose a form and start your request.</p>
          </div>
          <div className="flex h-10 items-center gap-2 border border-surface-border bg-white px-3 text-sm text-surface-muted sm:min-w-[260px]">
            <Search className="h-4 w-4" />
            <span>Search forms</span>
          </div>
        </div>

        {forms.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {forms.map((form) => (
              <FormCard key={form.slug} {...form} />
            ))}
          </div>
        ) : (
          <div className="app-panel p-10 text-center text-sm text-surface-muted">
            No available request forms right now.
          </div>
        )}
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
  const badgeText = status !== "published" ? "Pending" : "Coming soon";

  const inner = (
    <div
      className={`app-panel group flex h-full min-h-[150px] flex-col justify-between p-5 transition ${
        available ? "hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm" : "opacity-60"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-brand-50 text-brand-700 ring-1 ring-brand-100">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-surface-text">{name}</h2>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-surface-muted">{description}</p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between">
        {available ? (
          <span className="text-sm font-semibold text-brand-700">Start request</span>
        ) : (
          <span className="status-pill border-surface-border bg-slate-50 text-surface-muted">{badgeText}</span>
        )}
        {available ? (
          <ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-brand-700" />
        ) : null}
      </div>
    </div>
  );

  return available ? <Link href={routePath || `/forms/${slug}`}>{inner}</Link> : inner;
}
