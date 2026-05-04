"use client";

import { useState } from "react";
import { Clock3, ExternalLink } from "lucide-react";
import Link from "next/link";
import {
  AdminEmptyState,
  AdminHelpPanel,
  AdminMetricCard,
  AdminPageHeader,
  AdminSection,
  AdminStatusPill,
} from "@/components/admin-ui";
import { AdminFilterTabs, AdminSearchField } from "@/components/admin-ui-client";

type RequestRow = {
  _id: string;
  referenceNo: string;
  formType: string;
  formSlug: string;
  formName: string;
  submittedBy?: {
    name?: string;
    email?: string;
  };
  status: string;
  createdAt: string;
};

type ViewFilter = "all" | "pending" | "approved" | "rejected" | "returned";

export function RequestsClient({ requests }: { requests: RequestRow[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewFilter>("all");

  const filtered = requests.filter((request) => {
    const matchesQuery =
      !query ||
      [
        request.referenceNo,
        request.formName,
        request.formSlug,
        request.formType,
        request.submittedBy?.name,
        request.submittedBy?.email,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());

    if (!matchesQuery) return false;
    if (view === "all") return true;
    return request.status === view;
  });

  const counts = {
    pending: requests.filter((request) => request.status === "pending").length,
    approved: requests.filter((request) => request.status === "approved").length,
    rejected: requests.filter((request) => request.status === "rejected").length,
    returned: requests.filter((request) => request.status === "returned").length,
  };

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Operations"
        title="Admin queue"
        description="A single read-only queue for all submitted requests across native and imported forms."
      />

      <AdminHelpPanel title="What this page does">
        Use this page to quickly find a request, check where it came from, and open its detail page.
        This view does not change request data by itself.
      </AdminHelpPanel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Requests loaded" value={requests.length} />
        <AdminMetricCard label="Pending" value={counts.pending} tone="warn" />
        <AdminMetricCard label="Approved" value={counts.approved} tone="ok" />
        <AdminMetricCard label="Returned / Rejected" value={counts.returned + counts.rejected} />
      </div>

      <AdminSection
        title="Latest requests"
        description="Search by requester, form, or reference number."
        meta={`${filtered.length} of ${requests.length} shown`}
      >
        <div className="mb-5 flex flex-col gap-3">
          <AdminSearchField value={query} onChange={setQuery} placeholder="Search by requester, form, or reference number" />
          <AdminFilterTabs
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "All" },
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "returned", label: "Returned" },
              { value: "rejected", label: "Rejected" },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <AdminEmptyState
            title="No requests match these filters"
            description="Try another search or choose a different status."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-surface-border bg-slate-50 text-xs uppercase tracking-[0.08em] text-surface-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Reference</th>
                  <th className="px-5 py-3 font-semibold">Form</th>
                  <th className="px-5 py-3 font-semibold">Requester</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Submitted</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map((request) => (
                  <tr key={request._id} className="bg-white transition hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs text-surface-text">{request.referenceNo}</span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-surface-text">
                        {request.formName || request.formSlug || request.formType}
                      </p>
                      <p className="mt-1 text-xs text-surface-muted">{request.formType}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-surface-text">{request.submittedBy?.name || "Requester"}</p>
                      <p className="mt-1 text-xs text-surface-muted">{request.submittedBy?.email || "No email saved"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <AdminStatusPill tone={statusTone(request.status)}>{request.status}</AdminStatusPill>
                    </td>
                    <td className="px-5 py-4 text-surface-muted">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {new Date(request.createdAt).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/requests/${request.referenceNo}`}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline"
                      >
                        Open request
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>
    </div>
  );
}

function statusTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  if (status === "approved") return "ok";
  if (status === "pending" || status === "returned") return "warn";
  if (status === "rejected") return "danger";
  return "neutral";
}
