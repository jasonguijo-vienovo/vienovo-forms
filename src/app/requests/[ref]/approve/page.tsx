import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { PendingFormState } from "@/components/pending-form-state";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { safeAuth } from "@/lib/safe-auth";
import { connectMongo } from "@/lib/db/mongo";
import { RequestModel } from "@/models/Request";
import { approveCurrentStep, rejectCurrentStep, returnCurrentStep } from "./actions";

export default async function ApproveRequestPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const decodedRef = decodeURIComponent(ref);
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");
  const userEmail = session.user.email.toLowerCase();

  await connectMongo();
  const doc = await RequestModel.findOne({ referenceNo: decodedRef }).lean();
  if (!doc) notFound();

  const current = doc.approvalChain.find((a) => a.step === doc.currentStep) ?? null;
  if (!current || current.status !== "pending") redirect(`/requests/${encodeURIComponent(decodedRef)}`);
  if (current.approverEmail !== userEmail) redirect(`/requests/${encodeURIComponent(decodedRef)}`);

  const approveAction = approveCurrentStep.bind(null, decodedRef);
  const rejectAction = rejectCurrentStep.bind(null, decodedRef);
  const returnAction = returnCurrentStep.bind(null, decodedRef);

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

          <div id="comment" className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 scroll-mt-24">
            Leave a note in any box below, then choose the action you want to take.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <form id="approve" action={approveAction} className="space-y-2 scroll-mt-24">
              <PendingFormState className="space-y-2">
                <textarea
                  name="comment"
                  placeholder="Optional approval note"
                  className="w-full field-input min-h-[88px]"
                />
                <PendingSubmitButton
                  type="submit"
                  idleLabel="Approve"
                  pendingLabel="Approving..."
                  className="w-full bg-gradient-to-br from-brand-600 to-brand-700 text-white font-semibold py-2.5 rounded-lg hover:opacity-95 active:scale-[0.99] transition"
                />
              </PendingFormState>
            </form>

            <form id="reject" action={rejectAction} className="space-y-2 scroll-mt-24">
              <PendingFormState className="space-y-2">
                <textarea
                  name="comment"
                  placeholder="Reason for rejection (recommended)"
                  className="w-full field-input min-h-[88px]"
                />
                <PendingSubmitButton
                  type="submit"
                  idleLabel="Reject"
                  pendingLabel="Rejecting..."
                  className="w-full bg-red-600 text-white font-semibold py-2.5 rounded-lg hover:bg-red-700 active:scale-[0.99] transition"
                />
              </PendingFormState>
            </form>

            <form id="return" action={returnAction} className="space-y-2 scroll-mt-24">
              <PendingFormState className="space-y-2">
                <textarea
                  name="comment"
                  placeholder="Correction note required"
                  className="w-full field-input min-h-[88px]"
                />
                <PendingSubmitButton
                  type="submit"
                  idleLabel="Return for correction"
                  pendingLabel="Returning..."
                  className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 active:scale-[0.99] transition"
                />
              </PendingFormState>
            </form>
          </div>

          <div className="mt-5">
            <Link href={`/requests/${encodeURIComponent(decodedRef)}`} className="text-sm text-brand-700 hover:underline">
              Back to request
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

