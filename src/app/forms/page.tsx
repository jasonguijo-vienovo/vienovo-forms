import { FileText, PlusCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { getCatalogForms } from "@/lib/form-definitions";
import { safeAuth } from "@/lib/safe-auth";

export default async function FormsIndexPage() {
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");
  const forms = await getCatalogForms({ allowFallback: true });

  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">
            New request
          </h1>
          <p className="text-gray-500 mt-1">Choose a form and start your request.</p>
        </div>

        <section>
          <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-4">
            Available forms
          </h2>
          {forms.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {forms.map((form) => (
                <FormCard key={form.slug} {...form} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-brand-100 bg-white p-8 text-sm text-gray-400 text-center">
              No available request forms right now.
            </div>
          )}
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
        available ? "hover:shadow-md hover:border-brand-300 cursor-pointer" : "opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="rounded-lg bg-brand-50 p-2 text-brand-700">
            <FileText className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-gray-800 truncate">{name}</h3>
        </div>
        {!available && (
          <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            Soon
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
      {available ? (
        <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-700">
          <PlusCircle className="h-4 w-4" />
          Start request
        </div>
      ) : null}
    </div>
  );

  return available ? <Link href={routePath || `/forms/${slug}`}>{inner}</Link> : inner;
}
