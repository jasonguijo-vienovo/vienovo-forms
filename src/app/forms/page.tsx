import { redirect } from "next/navigation";
import Link from "next/link";
import { safeAuth } from "@/lib/safe-auth";
import { Navbar } from "@/components/navbar";

const FORMS = [
  {
    slug: "travel-booking",
    name: "Travel Booking",
    description: "Book a flight, hotel, or company travel.",
    available: true,
  },
  {
    slug: "cash-advance",
    name: "Cash Advance",
    description: "Request advance funds for upcoming expenses.",
    available: true,
  },
  {
    slug: "reimbursement",
    name: "Reimbursement",
    description: "Get reimbursed for expenses you already paid for.",
    available: true,
  },
  {
    slug: "request-for-payment",
    name: "Request for Payment",
    description: "Request payment to a vendor or supplier.",
    available: false,
  },
  {
    slug: "cashiering",
    name: "Cashiering",
    description: "Cashier-related transactions and requests.",
    available: false,
  },
] as const;

export default async function FormsIndexPage() {
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");

  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">
            New request
          </h1>
          <p className="text-gray-500 mt-1">
            Choose a form to start a new request.
          </p>
        </div>

        <section>
          <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-4">
            Forms
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FORMS.map((f) => (
              <FormCard key={f.slug} {...f} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function FormCard({
  slug,
  name,
  description,
  available,
}: {
  slug: string;
  name: string;
  description: string;
  available: boolean;
}) {
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

  return available ? <Link href={`/forms/${slug}`}>{inner}</Link> : inner;
}
