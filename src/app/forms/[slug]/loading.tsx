 "use client";

import { useParams } from "next/navigation";

const FORM_LABELS: Record<string, string> = {
  "travel-booking": "Travel Booking",
  "cash-advance": "Cash Advance",
  reimbursement: "Reimbursement",
  "request-for-payment": "Request for Payment",
  cashiering: "Cashiering",
};

function toTitleCase(input: string) {
  return input
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function Loading() {
  const params = useParams<{ slug?: string }>();
  const slug = String(params?.slug ?? "").trim();
  const formName = FORM_LABELS[slug] ?? (slug ? toTitleCase(slug) : "Form");

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
      <div className="rounded-xl border border-surface-border bg-white px-5 py-4 text-sm font-semibold text-surface-text shadow-xl">
        Opening {formName}...
      </div>
    </div>
  );
}
