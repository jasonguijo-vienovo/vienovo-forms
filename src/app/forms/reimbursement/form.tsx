"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import {
  REIMBURSEMENT_EXPENSE_ACCOUNTS,
  reimbursementExpenseFieldName,
} from "@/lib/forms/reimbursement";

type Approver = {
  id: string;
  name: string;
  email: string;
};

type EmployeePrefill = {
  firstName: string;
  lastName: string;
  department: string;
  supervisorEmail: string;
  departmentHeadEmail: string;
};

export type ReimbursementRouteOption = {
  id: string;
  department: string;
  costCenter: string;
  location: string;
  supervisorEmail: string;
  supervisorName: string;
  headEmail: string;
  headName: string;
};

export type ReimbursementInitialValues = Partial<{
  firstName: string;
  lastName: string;
  department: string;
  costCenter: string;
  location: string;
  formType: string;
  cashAdvanceReferenceNo: string;
  reason: string;
  dateFrom: string;
  dateTo: string;
  liquidationType: string;
  transactionNumber: string;
  psNumber: string;
  businessPartner: string;
  jvNo: string;
  expensesByCode: Record<string, number>;
  supportingFileName: string;
  agreed: boolean;
}>;

export type ReimbursementFormProps = {
  user: { email: string; name: string };
  requesterPreview?: boolean;
  prefill: EmployeePrefill;
  initial?: ReimbursementInitialValues;
  submitAction: (formData: FormData) => void | Promise<void>;
  submitLabel?: string;
  routes: ReimbursementRouteOption[];
  formTypeOptions: string[];
  cashAdvanceReferenceOptions: string[];
  liquidationTypeOptions: string[];
  supervisors: Approver[];
  heads: Approver[];
};

const BRAND_LOGO_SRC = "/brand/vienovo-feed-for-life.png";

export function ReimbursementForm(props: ReimbursementFormProps) {
  const {
    user,
    requesterPreview,
    prefill,
    initial,
    submitAction,
    submitLabel,
    routes,
    formTypeOptions,
    cashAdvanceReferenceOptions,
    liquidationTypeOptions,
    supervisors,
    heads,
  } = props;

  const initialSupervisorId = useMemo(() => {
    const email = (prefill.supervisorEmail || "").toLowerCase().trim();
    if (!email) return "";
    const match = supervisors.find((s) => s.email.toLowerCase() === email);
    return match?.id ?? "";
  }, [prefill.supervisorEmail, supervisors]);

  const initialHeadId = useMemo(() => {
    const email = (prefill.departmentHeadEmail || "").toLowerCase().trim();
    if (!email) return "";
    const match = heads.find((h) => h.email.toLowerCase() === email);
    return match?.id ?? "";
  }, [prefill.departmentHeadEmail, heads]);

  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);

  const [firstName, setFirstName] = useState(initial?.firstName ?? prefill.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? prefill.lastName ?? "");
  const [department, setDepartment] = useState(initial?.department ?? prefill.department ?? "");
  const [formType, setFormType] = useState(initial?.formType ?? "");
  const [cashAdvanceReferenceNo, setCashAdvanceReferenceNo] = useState(
    initial?.cashAdvanceReferenceNo ?? ""
  );
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [dateFrom, setDateFrom] = useState(initial?.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(initial?.dateTo ?? "");
  const [costCenter, setCostCenter] = useState(initial?.costCenter ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [liquidationType, setLiquidationType] = useState(initial?.liquidationType ?? "");

  const [transactionNumber, setTransactionNumber] = useState(initial?.transactionNumber ?? "");
  const [psNumber, setPsNumber] = useState(initial?.psNumber ?? "");
  const [businessPartner, setBusinessPartner] = useState(initial?.businessPartner ?? "");
  const [jvNo, setJvNo] = useState(initial?.jvNo ?? "");

  const [supervisorId, setSupervisorId] = useState(initialSupervisorId);
  const [headId, setHeadId] = useState(initialHeadId);

  const supervisorEmail = useMemo(
    () => supervisors.find((s) => s.id === supervisorId)?.email ?? "",
    [supervisors, supervisorId],
  );
  const headEmail = useMemo(
    () => heads.find((h) => h.id === headId)?.email ?? "",
    [heads, headId],
  );

  const departmentOptions = useMemo(() => {
    const uniq = new Set<string>();
    for (const r of routes) uniq.add(r.department);
    return [...uniq].sort((a, b) => a.localeCompare(b));
  }, [routes]);

  const costCenterOptions = useMemo(() => {
    const uniq = new Set<string>();
    for (const r of routes) {
      if (r.department === department) uniq.add(r.costCenter);
    }
    return [...uniq].sort((a, b) => a.localeCompare(b));
  }, [routes, department]);

  const locationOptions = useMemo(() => {
    const uniq = new Set<string>();
    for (const r of routes) {
      if (r.department === department && r.costCenter === costCenter) uniq.add(r.location);
    }
    return [...uniq].sort((a, b) => a.localeCompare(b));
  }, [routes, department, costCenter]);

  const selectedRoute = useMemo(() => {
    return (
      routes.find(
        (r) =>
          r.department === department &&
          r.costCenter === costCenter &&
          r.location === location
      ) ?? null
    );
  }, [routes, department, costCenter, location]);

  const routeSupervisorId = useMemo(() => {
    const email = (selectedRoute?.supervisorEmail || "").toLowerCase().trim();
    if (!email) return "";
    return supervisors.find((a) => a.email.toLowerCase() === email)?.id ?? "";
  }, [selectedRoute?.supervisorEmail, supervisors]);

  const routeHeadId = useMemo(() => {
    const email = (selectedRoute?.headEmail || "").toLowerCase().trim();
    if (!email) return "";
    return heads.find((a) => a.email.toLowerCase() === email)?.id ?? "";
  }, [selectedRoute?.headEmail, heads]);

  // When a matching route is selected, auto-fill approval IDs (still editable as fallback).
  useEffect(() => {
    if (routeSupervisorId) setSupervisorId(routeSupervisorId);
    if (routeHeadId) setHeadId(routeHeadId);
  }, [routeSupervisorId, routeHeadId]);

  const [fileName, setFileName] = useState(initial?.supportingFileName ?? "");
  const [agreed, setAgreed] = useState(Boolean(initial?.agreed));

  const initialExpensesRaw = useMemo(() => {
    const fromDoc = initial?.expensesByCode ?? {};
    const out: Record<string, string> = {};
    for (const acc of REIMBURSEMENT_EXPENSE_ACCOUNTS) {
      const v = fromDoc[acc.code];
      out[acc.code] = v != null && Number.isFinite(v) && v > 0 ? String(v) : "";
    }
    return out;
  }, [initial?.expensesByCode]);

  const initialSelectedCodes = useMemo(() => {
    const fromDoc = initial?.expensesByCode ?? {};
    const codes = Object.keys(fromDoc).filter((c) =>
      REIMBURSEMENT_EXPENSE_ACCOUNTS.some((a) => a.code === c)
    );
    // Keep deterministic order (matches list ordering)
    const order = new Map(REIMBURSEMENT_EXPENSE_ACCOUNTS.map((a, i) => [a.code, i]));
    return [...new Set(codes)].sort(
      (a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999)
    );
  }, [initial?.expensesByCode]);

  const [selectedExpenseCodes, setSelectedExpenseCodes] = useState<string[]>(
    initialSelectedCodes
  );
  const [addExpenseCode, setAddExpenseCode] = useState("");

  const [expenseRawByCode, setExpenseRawByCode] = useState<Record<string, string>>(initialExpensesRaw);
  const [focusedCode, setFocusedCode] = useState<string>("");

  const total = useMemo(() => {
    let sum = 0;
    for (const code of selectedExpenseCodes) {
      const raw = expenseRawByCode[code] ?? "";
      const n = Number(sanitizeAmount(raw));
      if (Number.isFinite(n) && n > 0) sum += n;
    }
    return Math.round(sum * 100) / 100;
  }, [expenseRawByCode, selectedExpenseCodes]);

  function validate(): string[] {
    const errs: string[] = [];
    if (!firstName) errs.push("First Name");
    if (!lastName) errs.push("Last Name");
    if (!department) errs.push("Department");
    if (!costCenter) errs.push("Cost Center");
    if (!location) errs.push("Location");
    if (department && costCenter && location && !selectedRoute) {
      errs.push("Routing (no match found for Department + Cost Center + Location)");
    }
    if (!formType) errs.push("Form Type");
    if (formType === "CA Liquidation" && !cashAdvanceReferenceNo) {
      errs.push("Cash Advance Reference #");
    }
    if (!reason) errs.push("Reason");
    if (!dateFrom) errs.push("Date From");
    if (!dateTo) errs.push("Date To");
    if (selectedExpenseCodes.length === 0) errs.push("Expense Breakdown (select at least one account)");
    if (total <= 0) errs.push("Total Expenses (add at least one expense amount)");
    if (selectedRoute && !routeSupervisorId && !supervisorId) errs.push("Immediate Superior");
    if (selectedRoute && !routeHeadId && !headId) errs.push("Department Head");
    if (!agreed) errs.push("Expense certification");
    return errs;
  }

  function handleExpenseChange(code: string, next: string) {
    const cleaned = sanitizeAmount(next);
    setExpenseRawByCode((prev) => ({ ...prev, [code]: cleaned }));
  }

  const availableAccountsToAdd = useMemo(() => {
    const selected = new Set(selectedExpenseCodes);
    return REIMBURSEMENT_EXPENSE_ACCOUNTS.filter((a) => !selected.has(a.code));
  }, [selectedExpenseCodes]);

  function addSelectedExpense() {
    const code = addExpenseCode;
    if (!code) return;
    if (!REIMBURSEMENT_EXPENSE_ACCOUNTS.some((a) => a.code === code)) return;
    if (selectedExpenseCodes.includes(code)) return;
    setSelectedExpenseCodes((prev) => [...prev, code]);
    setExpenseRawByCode((prev) => ({ ...prev, [code]: prev[code] ?? "" }));
    setAddExpenseCode("");
  }

  function removeSelectedExpense(code: string) {
    setSelectedExpenseCodes((prev) => prev.filter((c) => c !== code));
    setExpenseRawByCode((prev) => ({ ...prev, [code]: "" }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs = validate();
    if (errs.length) {
      setErrors(errs);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors([]);
    const fd = new FormData(e.currentTarget);
    startTransition(() => submitAction(fd));
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
              Vienovo Reimbursement
            </div>
            <div className="text-teal-200 text-[11px] sm:text-xs font-medium mt-0.5">
              Reimbursement Request Form
            </div>
          </div>
        </div>
        <div className="px-5 py-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-teal-400 to-teal-700"></div>
          <div className="pl-3">
            <h1 className="text-xl font-bold text-gray-800">Reimbursement</h1>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
              Submit expenses for reimbursement approval and processing.
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

      <Card>
        <SectionTitle>Personal Information</SectionTitle>

        <Field label="Email Address" required>
          <input type="email" value={user.email} readOnly className="field-input field-locked" />
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
        <SectionTitle>Reimbursement Details</SectionTitle>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Department" required>
            <select
              name="department"
              value={department}
              onChange={(e) => {
                const next = e.target.value;
                setDepartment(next);
                setCostCenter("");
                setLocation("");
              }}
              required
              className="field-input"
            >
              <option value="">-- Select --</option>
              {department && !departmentOptions.includes(department) ? (
                <option value={department}>{department} (Current)</option>
              ) : null}
              {departmentOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Form Type" required>
            <input type="hidden" name="formType" value={formType} />
            <div className="space-y-2">
              {formTypeOptions.map((v) => (
                <label
                  key={v}
                  className="flex items-center gap-2 rounded-xl border border-brand-100 px-3 py-2 hover:bg-brand-50/50 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="_formTypeRadio"
                    value={v}
                    checked={formType === v}
                    onChange={() => {
                      setFormType(v);
                      if (v !== "CA Liquidation") setCashAdvanceReferenceNo("");
                    }}
                    className="accent-brand-600"
                    required
                  />
                  <span className="text-sm text-gray-700">{v}</span>
                </label>
              ))}
              {formTypeOptions.length === 0 ? (
                <p className="text-xs text-gray-400 italic">
                  No options yet. Add values in Admin → Dropdowns → Reimbursement → Form Type.
                </p>
              ) : null}
            </div>
          </Field>
        </div>

        {formType === "CA Liquidation" && (
          <div className="mt-4">
            <Field label="Cash Advance Reference #" required>
              <input
                list="cashAdvanceReferenceOptions"
                name="cashAdvanceReferenceNo"
                value={cashAdvanceReferenceNo}
                onChange={(e) => setCashAdvanceReferenceNo(e.target.value)}
                required
                className="field-input"
                placeholder="Select your Cash Advance reference (e.g. CA-YYYYMMDD-0001)"
              />
              <datalist id="cashAdvanceReferenceOptions">
                {cashAdvanceReferenceOptions.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              <p className="text-[11px] text-gray-500 mt-1">
                Required for CA Liquidation. This must be a Cash Advance request you submitted.
              </p>
            </Field>
          </div>
        )}

        <Field label="Reason" required className="mt-4">
          <textarea
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            className="field-input min-h-[96px]"
            placeholder="Describe the purpose / reason..."
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="Date From" required>
            <input
              type="date"
              name="dateFrom"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              required
              className="field-input"
            />
          </Field>
          <Field label="Date To" required>
            <input
              type="date"
              name="dateTo"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              required
              className="field-input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="Cost Center" required>
            <select
              name="costCenter"
              value={costCenter}
              onChange={(e) => {
                const next = e.target.value;
                setCostCenter(next);
                setLocation("");
              }}
              required
              className="field-input"
              disabled={!department}
            >
              <option value="">{department ? "-- Select --" : "-- Select Department first --"}</option>
              {costCenter && !costCenterOptions.includes(costCenter) ? (
                <option value={costCenter}>{costCenter} (Current)</option>
              ) : null}
              {costCenterOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location" required>
            <select
              name="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
              className="field-input"
              disabled={!department || !costCenter}
            >
              <option value="">
                {department && costCenter ? "-- Select --" : "-- Select Cost Center first --"}
              </option>
              {location && !locationOptions.includes(location) ? (
                <option value={location}>{location} (Current)</option>
              ) : null}
              {locationOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="Liquidation Type">
            <input
              list="liquidationTypeOptions"
              name="liquidationType"
              value={liquidationType}
              onChange={(e) => setLiquidationType(e.target.value)}
              className="field-input"
              placeholder="Type or select..."
            />
            <datalist id="liquidationTypeOptions">
              {liquidationTypeOptions.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </Field>

          <Field label="Total Expenses" required>
            <input type="hidden" name="totalExpenses" value={String(total)} />
            <input
              type="text"
              value={formatAmount(String(total))}
              readOnly
              className="field-input field-locked"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Auto-calculated from the expense breakdown.
            </p>
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle>Expense Breakdown</SectionTitle>
        <input
          type="hidden"
          name="selectedExpenseCodes"
          value={JSON.stringify(selectedExpenseCodes)}
        />

        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end mb-4">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-700">
              Add expense account <span className="text-red-500">*</span>
            </label>
            <select
              value={addExpenseCode}
              onChange={(e) => setAddExpenseCode(e.target.value)}
              className="field-input mt-2"
            >
              <option value="">-- Select an account --</option>
              {availableAccountsToAdd.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} {a.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={addSelectedExpense}
            className="bg-gray-900 hover:bg-black text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition"
          >
            Add
          </button>
        </div>

        <div className="rounded-xl border border-brand-100 overflow-hidden">
          <div className="grid grid-cols-[140px_1fr_140px] bg-brand-50 text-xs font-semibold text-gray-700">
            <div className="px-3 py-2 border-r border-brand-100">Account</div>
            <div className="px-3 py-2 border-r border-brand-100">Description</div>
            <div className="px-3 py-2 text-right">Amount</div>
          </div>

          {selectedExpenseCodes.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-400 text-center">
              No accounts selected yet. Use the selector above to add expense accounts.
            </div>
          ) : null}

          {selectedExpenseCodes.map((code) => {
            const acc = REIMBURSEMENT_EXPENSE_ACCOUNTS.find((a) => a.code === code);
            if (!acc) return null;
            const raw = expenseRawByCode[code] ?? "";
            const fieldName = reimbursementExpenseFieldName(acc.code);
            const isFocused = focusedCode === acc.code;
            return (
              <div
                key={acc.code}
                className="grid grid-cols-[140px_1fr_140px] items-center border-t border-brand-100"
              >
                <div className="px-3 py-2 text-xs font-mono text-gray-600 border-r border-brand-100">
                  <div className="flex items-center justify-between gap-2">
                    <span>{acc.code}</span>
                    <button
                      type="button"
                      onClick={() => removeSelectedExpense(acc.code)}
                      className="text-[10px] font-bold uppercase tracking-wider text-red-600 hover:text-red-800"
                      title="Remove"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="px-3 py-2 text-sm text-gray-700 border-r border-brand-100">
                  {acc.label}
                </div>
                <div className="px-3 py-2">
                  <input type="hidden" name={fieldName} value={raw} />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={isFocused ? raw : formatAmount(raw)}
                    onFocus={() => setFocusedCode(acc.code)}
                    onBlur={() => setFocusedCode("")}
                    onChange={(e) => handleExpenseChange(acc.code, e.target.value)}
                    placeholder="0.00"
                    className="field-input text-right"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle>Supporting Document</SectionTitle>
        <p className="text-xs text-gray-400 mb-3">
          Optional. PDF, DOC, XLS, PNG, JPG - max 10 MB.
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
            <p className="text-sm font-semibold text-brand-700 mt-2">{fileName}</p>
          )}
        </label>
        <p className="text-[11px] text-gray-500 mt-2 italic">
          File will be uploaded to Drive on submit.
        </p>
      </Card>

      <Card>
        <SectionTitle>Approval</SectionTitle>

        <p className="text-xs text-gray-500 mb-4">
          Approvers are auto-filled based on the Department + Cost Center + Location routing.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Immediate Superior" required>
            {selectedRoute && routeSupervisorId ? (
              <>
                <input
                  type="hidden"
                  name="supervisorId"
                  value={routeSupervisorId}
                />
                <input
                  type="text"
                  value={selectedRoute.supervisorName || "—"}
                  readOnly
                  className="field-input field-locked"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Auto-filled from routing.
                </p>
              </>
            ) : (
              <select
                name="supervisorId"
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                required
                className="field-input"
                disabled={!selectedRoute}
              >
                <option value="">
                  {selectedRoute ? "-- Select --" : "-- Select routing first --"}
                </option>
                {supervisors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Immediate Superior Email">
            <input
              type="email"
              value={selectedRoute?.supervisorEmail || supervisorEmail}
              readOnly
              placeholder="Auto-filled from routing"
              className="field-input field-locked"
            />
            {selectedRoute && selectedRoute.supervisorEmail && !routeSupervisorId ? (
              <p className="text-[11px] text-amber-700 mt-1">
                This email is not in the Approvers list. Add it in Admin → Approvers.
              </p>
            ) : null}
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="Department Head" required>
            {selectedRoute && routeHeadId ? (
              <>
                <input type="hidden" name="headId" value={routeHeadId} />
                <input
                  type="text"
                  value={selectedRoute.headName || "—"}
                  readOnly
                  className="field-input field-locked"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Auto-filled from routing.
                </p>
              </>
            ) : (
              <select
                name="headId"
                value={headId}
                onChange={(e) => setHeadId(e.target.value)}
                required
                className="field-input"
                disabled={!selectedRoute}
              >
                <option value="">
                  {selectedRoute ? "-- Select --" : "-- Select routing first --"}
                </option>
                {heads.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Department Head Email">
            <input
              type="email"
              value={selectedRoute?.headEmail || headEmail}
              readOnly
              placeholder="Auto-filled from routing"
              className="field-input field-locked"
            />
            {selectedRoute && selectedRoute.headEmail && !routeHeadId ? (
              <p className="text-[11px] text-amber-700 mt-1">
                This email is not in the Approvers list. Add it in Admin → Approvers.
              </p>
            ) : null}
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle>Accounting (Optional)</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Transaction Number">
            <input
              type="text"
              name="transactionNumber"
              value={transactionNumber}
              onChange={(e) => setTransactionNumber(e.target.value)}
              className="field-input"
              placeholder="Optional"
            />
          </Field>
          <Field label="PS #">
            <input
              type="text"
              name="psNumber"
              value={psNumber}
              onChange={(e) => setPsNumber(e.target.value)}
              className="field-input"
              placeholder="Optional"
            />
          </Field>
          <Field label="Business Partner">
            <input
              type="text"
              name="businessPartner"
              value={businessPartner}
              onChange={(e) => setBusinessPartner(e.target.value)}
              className="field-input"
              placeholder="Optional"
            />
          </Field>
          <Field label="JV No">
            <input
              type="text"
              name="jvNo"
              value={jvNo}
              onChange={(e) => setJvNo(e.target.value)}
              className="field-input"
              placeholder="Optional"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle>Certification</SectionTitle>
        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            I certify that all expenses in this request are accurate, truthful,
            and solely for legitimate business purposes, in compliance with the
            Company’s expense policy. I affirm that no claims are fraudulent,
            personal, or misrepresented, and all attached documents are
            authentic. I understand that misuse of funds or false submissions
            may result in disciplinary action, including salary deductions for
            unsettled amounts, as allowed by company policy and labor laws. By
            submitting, I accept full responsibility for this claim.
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="agreeCertification"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 accent-brand-600"
              required
            />
            <span>
              I agree and certify the reimbursement claim.
              <span className="text-red-500"> *</span>
            </span>
          </label>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end items-center gap-3 pt-6">
          <button
            type="submit"
            disabled={pending}
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
