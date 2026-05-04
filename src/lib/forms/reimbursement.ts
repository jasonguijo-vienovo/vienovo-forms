export type ReimbursementExpenseAccount = {
  code: string;
  label: string;
};

export const REIMBURSEMENT_EXPENSE_ACCOUNTS: ReimbursementExpenseAccount[] = [
  { code: "5015-00-00-00", label: "Delivery Expense" },
  { code: "5016-00-00-00", label: "Logistics Inter-warehouse Cost" },
  { code: "5006-00-00-00", label: "Supplier Pick-up Freight Expense" },
  { code: "6002-00-00-00", label: "Manpower Services" },
  { code: "6004-00-00-00", label: "Meals and lodging" },
  { code: "6104-00-00-00", label: "Training, Seminar & Development" },
  { code: "6201-00-00-00", label: "Car Rental Expense" },
  { code: "6202-00-00-00", label: "Telecommunication" },
  { code: "6204-00-00-00", label: "Dues and Subscription" },
  { code: "6220-00-00-00", label: "Electricity and Water" },
  { code: "6402-00-00-00", label: "Repairs and Maintenance" },
  { code: "6600-00-00-00", label: "Representation & Entertainment Expense" },
  { code: "6601-00-00-00", label: "Meetings" },
  { code: "6602-00-00-00", label: "Travelling Expenses" },
  { code: "6603-00-00-00", label: "Postage & Courier Expense" },
  { code: "6605-00-00-00", label: "Advertising & Promotion" },
  { code: "6850-00-00-00", label: "Printing & Reproduction" },
  { code: "6851-00-00-00", label: "Office Supplies" },
  { code: "6901-00-00-00", label: "Notarial Fees" },
  { code: "6902-00-00-00", label: "Registration Fees" },
  { code: "6903-00-00-00", label: "Processing Fees" },
  { code: "6905-00-00-00", label: "Bank Charge Services" },
  { code: "6915-00-00-00", label: "Warehouse Supplies" },
];

export function reimbursementExpenseFieldName(code: string) {
  return `expense_${code.replace(/-/g, "_")}`;
}

export function parseMoneyInput(input: unknown): number {
  const raw = String(input ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export function formatMoney(n: number) {
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

