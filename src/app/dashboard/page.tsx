import { safeAuth } from "@/lib/safe-auth";
import { Navbar } from "@/components/navbar";
import Link from "next/link";
import { redirect } from "next/navigation";

const FORMS = [
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
    slug: "travel-booking",
    name: "Travel Booking",
    description: "Book a flight, hotel, or company travel.",
    available: true,
  },
  {
    slug: "cashiering",
    name: "Cashiering",
    description: "Cashier-related transactions and requests.",
    available: false,
  },
];

export default async function DashboardPage() {
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");
  const name = session?.user?.name ?? session?.user?.email ?? "there";

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
            {FORMS.map((f) => (
              <FormCard key={f.slug} {...f} />
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="My recent requests">
            <EmptyState message="You haven't submitted any requests yet." />
          </Panel>
          <Panel title="Pending my approval">
            <EmptyState message="No pending approvals." />
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
  return (
    <div className="text-center py-10 text-sm text-gray-400">{message}</div>
  );
}
