"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { FormActionResult } from "@/lib/forms/action-result";

type Approver = {
  id: string;
  name: string;
  email: string;
};

type EmployeePrefill = {
  firstName: string;
  lastName: string;
};
const BRAND_LOGO_SRC = "/brand/vienovo-feed-for-life.png";

export type CashAdvanceInitialValues = Partial<{
  payablesTo: string;
  payeeName: string;
  amount: string;
  reason: string;
  forApprovalNote: string;
  agreed: boolean;
}>;

export type CashAdvanceFormProps = {
  user: { email: string; name: string };
  prefill: EmployeePrefill;
  initial?: CashAdvanceInitialValues;
  payableToOptions: string[];
  approvers: Approver[];
  submitAction: (formData: FormData) => Promise<FormActionResult>;
  submitLabel?: string;
};

export function CashAdvanceForm(props: CashAdvanceFormProps) {
  const router = useRouter();
  const {
    user,
    prefill,
    initial,
    payableToOptions,
    approvers,
    submitAction,
    submitLabel,
  } = props;

  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState(prefill.firstName || "");
  const [lastName, setLastName] = useState(prefill.lastName || "");

  const [payablesTo, setPayablesTo] = useState(initial?.payablesTo ?? "");
  const [payeeName, setPayeeName] = useState(initial?.payeeName ?? "");
  const [amountRaw, setAmountRaw] = useState(sanitizeAmount(initial?.amount ?? ""));
  const [amountFocused, setAmountFocused] = useState(false);
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [forApprovalNote, setForApprovalNote] = useState(
    initial?.forApprovalNote ?? ""
  );
  const [agreed, setAgreed] = useState(Boolean(initial?.agreed));

  const [approverId, setApproverId] = useState("");
  const [fileName, setFileName] = useState("");

  const approverEmail = useMemo(
    () => approvers.find((a) => a.id === approverId)?.email ?? "",
    [approvers, approverId]
  );

  function validate(): string[] {
    const errs: string[] = [];
    if (!firstName) errs.push("First Name");
    if (!lastName) errs.push("Last Name");
    if (!payablesTo) errs.push("Payables to");
    if (!payeeName) errs.push("Name of Payee");
    if (!amountRaw || Number(amountRaw) <= 0) errs.push("Amount");
    if (!reason) errs.push("Reason for CA");
    if (!approverId) errs.push("Approver");
    if (!agreed) errs.push("Cash Advance Authorization Agreement");
    return errs;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs = validate();
    if (errs.length) {
      setErrors(errs);
      setSubmitError(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors([]);
    setSubmitError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() => {
      void submitAction(fd).then((result) => {
        if (!result.ok) {
          setSubmitError(result.error);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }

        router.push(result.redirectTo);
        router.refresh();
      });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card className="!p-0 overflow-hidden">
        <div
          className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-5"
          style={{
            background:
              "linear-gradient(90deg,#0f766e 0%,#115e59 50%,#134e4a 100%)",
          }}
        >
          <div className="rounded-xl bg-white/90 px-2 py-1 ring-2 ring-white/30">
            <Image
              src={BRAND_LOGO_SRC}
              alt="Vienovo"
              width={140}
              height={28}
              priority
              className="h-7 w-auto"
            />
          </div>
          <div className="ml-auto text-right">
            <div className="text-base sm:text-lg font-bold text-white tracking-tight">
              Vienovo Cash Advance
            </div>
            <div className="text-teal-200 text-[11px] sm:text-xs font-medium mt-0.5">
              Cash Advance Request Form
            </div>
          </div>
        </div>
        <div className="px-5 py-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-teal-400 to-teal-700"></div>
          <div className="pl-3">
            <h1 className="text-xl font-bold text-gray-800">
              Cash Advance Request
            </h1>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
              Submit a cash advance request for approval.
            </p>
            <p className="text-xs text-red-400 mt-2 font-medium">
              * Indicates required question
            </p>
          </div>
        </div>
      </Card>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          <p className="font-semibold mb-1">Please complete:</p>
          <ul className="list-disc pl-5 text-xs space-y-0.5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          <p className="font-semibold mb-1">Submission failed.</p>
          <p>{submitError}</p>
        </div>
      )}

      <Card>
        <SectionTitle>Personal Information</SectionTitle>

        <Field label="Email Address" required>
          <input
            type="email"
            value={user.email}
            readOnly
            className="field-input field-locked"
          />
          <p className="text-xs text-gray-400 mt-1">
            Signed in as <strong>{user.email}</strong>
          </p>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="First Name" required>
            <input
              type="text"
              name="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="field-input"
            />
          </Field>
          <Field label="Last Name" required>
            <input
              type="text"
              name="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="field-input"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle>Cash Advance Details</SectionTitle>

        <Field label="Payables to" required>
          <input
            list="payablesToOptions"
            name="payablesTo"
            value={payablesTo}
            onChange={(e) => setPayablesTo(e.target.value)}
            required
            className="field-input"
            placeholder="Type or select..."
          />
          <datalist id="payablesToOptions">
            {payableToOptions.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="Name of Payee" required>
            <input
              type="text"
              name="payeeName"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              required
              className="field-input"
            />
          </Field>
          <Field label="Amount" required>
            <input type="hidden" name="amount" value={amountRaw} />
            <input
              type="text"
              inputMode="decimal"
              value={amountFocused ? amountRaw : formatAmount(amountRaw)}
              onFocus={() => setAmountFocused(true)}
              onBlur={() => setAmountFocused(false)}
              onChange={(e) => setAmountRaw(sanitizeAmount(e.target.value))}
              placeholder="0.00"
              required
              className="field-input"
            />
          </Field>
        </div>

        <Field label="Reason for CA" required className="mt-4">
          <textarea
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            className="field-input min-h-[96px]"
            placeholder="Describe the reason..."
          />
        </Field>

        <Field label="For Approval Note" className="mt-4">
          <textarea
            name="forApprovalNote"
            value={forApprovalNote}
            onChange={(e) => setForApprovalNote(e.target.value)}
            className="field-input min-h-[84px]"
            placeholder="Optional note to approver..."
          />
        </Field>
      </Card>

      <Card>
        <SectionTitle>Supporting Document</SectionTitle>
        <p className="text-xs text-gray-400 mb-3">
          Optional. PDF, DOC, XLS, PNG, JPG — max 10 MB.
        </p>
        <input type="hidden" name="supportingFileName" value={fileName} />
        <label
          htmlFor="supportingDoc"
          className="block border-2 border-dashed border-brand-200 rounded-2xl p-6 text-center cursor-pointer hover:border-brand-500 hover:bg-brand-50 transition-all bg-brand-50/30"
        >
          <input
            id="supportingDoc"
            type="file"
            className="hidden"
            name="supportingDocument"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          />
          <p className="text-sm font-medium text-gray-500">
            Click to upload or drag and drop
          </p>
          {fileName && (
            <p className="text-sm font-semibold text-brand-700 mt-2">
              {fileName}
            </p>
          )}
        </label>
        <p className="text-[11px] text-gray-500 mt-2 italic">
          File will be uploaded to Drive on submit.
        </p>
      </Card>

      <Card>
        <SectionTitle>Approval</SectionTitle>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Approver" required>
            <SearchableSelect
              name="approverId"
              value={approverId}
              onChange={setApproverId}
              required
              options={approvers.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Field>
          <Field label="Approver's Email">
            <input
              type="email"
              value={approverEmail}
              readOnly
              placeholder="Auto-filled on selection"
              className="field-input field-locked"
            />
          </Field>
        </div>

        <div className="mt-6 rounded-xl border border-brand-100 bg-brand-50/40 p-4">
          <p className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 mb-2">
            Cash Advance Authorization Agreement
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            By submitting this application, I acknowledge that all cash advances
            must be liquidated within seven (7) calendar days from the end date
            of the activity or purpose for which the cash advance was granted. I
            further agree that if I fail to liquidate within the prescribed
            period, the Company may recover the unliquidated balance from my
            salary or final pay, provided such recovery will not reduce my wages
            below the applicable minimum wage.
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="agreeAuthorization"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 accent-brand-600"
              required
            />
            <span>
              I agree to the Cash Advance Authorization Agreement.
              <span className="text-red-500"> *</span>
            </span>
          </label>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end items-center gap-3 pt-6">
          <button
            type="submit"
            disabled={pending || !agreed}
            className="bg-gradient-to-br from-brand-600 to-brand-700 text-white font-semibold px-8 py-2.5 rounded-lg shadow-md hover:opacity-95 active:scale-[0.99] transition disabled:opacity-50 w-full sm:w-auto"
          >
            {pending ? "Submitting..." : submitLabel ?? "Submit Request"}
          </button>
        </div>
      </Card>
    </form>
  );
}

function sanitizeAmount(input: string) {
  let v = String(input ?? "").replace(/,/g, "");
  v = v.replace(/[^\d.]/g, "");
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    const before = v.slice(0, firstDot);
    const after = v.slice(firstDot + 1).replace(/\./g, "");
    v = `${before}.${after}`;
  }
  const [whole, frac = ""] = v.split(".");
  if (v.includes(".")) return `${whole}.${frac.slice(0, 2)}`;
  return whole;
}

function formatAmount(raw: string) {
  const cleaned = sanitizeAmount(raw);
  if (!cleaned) return "";
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return cleaned;
  const [, frac = ""] = cleaned.split(".");
  const minFrac = Math.min(frac.length, 2);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: minFrac,
    maximumFractionDigits: 2,
  }).format(n);
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-brand-100 px-4 sm:px-6 py-5 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-5">
      {children}
    </p>
  );
}

function Field({
  label,
  children,
  required,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
