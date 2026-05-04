import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { safeAuth } from "@/lib/safe-auth";
import { connectMongo } from "@/lib/db/mongo";
import { RequestModel } from "@/models/Request";
import { approveCurrentStep, rejectCurrentStep } from "./actions";

export default async function ApproveRequestPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");
  const userEmail = session.user.email.toLowerCase();

  await connectMongo();
  const doc = await RequestModel.findOne({ referenceNo: ref }).lean();
  if (!doc) notFound();

  const current = doc.approvalChain.find((a) => a.step === doc.currentStep) ?? null;
  if (!current || current.status !== "pending") redirect(`/requests/${ref}`);
  if (current.approverEmail !== userEmail) redirect(`/requests/${ref}`);

  const approveAction = approveCurrentStep.bind(null, ref);
  const rejectAction = rejectCurrentStep.bind(null, ref);

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6">
          <h1 className="text-xl font-bold text-gray-800">Approve request</h1>
          <p className="text-sm text-gray-500 mt-1">
            Reference <span className="font-mono font-semibold">{doc.referenceNo}</span>
          </p>

          <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50 p-4">
            <p className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700">
              Current step
            </p>
            <p className="text-sm font-semibold text-gray-800 mt-1">
              {current.approverName} <span className="text-gray-400">({current.role})</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">{current.approverEmail}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
            <form action={approveAction} className="space-y-2">
              <textarea
                name="comment"
                placeholder="Optional approval note"
                className="w-full field-input min-h-[88px]"
              />
              <button
                type="submit"
                className="w-full bg-gradient-to-br from-brand-600 to-brand-700 text-white font-semibold py-2.5 rounded-lg hover:opacity-95 active:scale-[0.99] transition"
              >
                Approve
              </button>
            </form>

            <form action={rejectAction} className="space-y-2">
              <textarea
                name="comment"
                placeholder="Reason for rejection (recommended)"
                className="w-full field-input min-h-[88px]"
              />
              <button
                type="submit"
                className="w-full bg-red-600 text-white font-semibold py-2.5 rounded-lg hover:bg-red-700 active:scale-[0.99] transition"
              >
                Reject
              </button>
            </form>
          </div>

          <div className="mt-5">
            <Link href={`/requests/${ref}`} className="text-sm text-brand-700 hover:underline">
              Back to request
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

