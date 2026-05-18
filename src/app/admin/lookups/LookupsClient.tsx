"use client";

import { useEffect, useState } from "react";
import { AdminEmptyState, AdminHelpPanel, AdminPageHeader, AdminSection, AdminStatusPill } from "@/components/admin-ui";
import { AdminSearchField } from "@/components/admin-ui-client";
import { PendingFormState } from "@/components/pending-form-state";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  addLookup,
  addLookupBulk,
  addLookupFromApproverRole,
  deleteLookup,
  deleteLookupCategory,
  scanRolesLookups,
  syncLookupCategoryFromUserInfo,
  syncLookupCategoryFromApprovers,
  toggleLookup,
  updateLookup,
  updateLookupCategoryUserInfoBinding,
} from "./actions";

export type LookupAdminItem = {
  id: string;
  value: string;
  label?: string;
  isActive: boolean;
};

export type LookupAdminGroup = {
  key: string;
  title: string;
  description: string;
  categories: string[];
};

type UserInfoFieldOption = {
  value: string;
  label: string;
};

function formatRoleLabel(role: string) {
  if (role === "sla") return "SLA";
  if (role === "far") return "FAR";
  if (role === "cashAdvanceApprover") return "Cash Advance Approver";
  if (role === "hr") return "HR";
  if (role === "it") return "IT";
  if (role === "qa") return "QA";
  if (role === "ceo") return "CEO";
  if (role === "cfo") return "CFO";
  if (role === "coo") return "COO";
  return role
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatSyncDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid timestamp";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ROLE_DEFAULTS_STORAGE_KEY = "lookup-add-from-approver-role-defaults-v1";

function normalizeKey(input: string) {
  return input.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeRoleTag(input: string) {
  return String(input ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

function inferDefaultRoleForCategory(input: {
  category: string;
  categoryLabel: string;
  approverRoles: string[];
}) {
  const { category, categoryLabel, approverRoles } = input;
  const byKey = new Map(approverRoles.map((role) => [normalizeRoleTag(role), role]));
  const key = `${normalizeKey(category)} ${normalizeKey(categoryLabel)}`;

  const firstMatch = (candidates: string[]) => {
    for (const candidate of candidates) {
      const found = byKey.get(normalizeRoleTag(candidate));
      if (found) return found;
    }
    return null;
  };

  if (key.includes("cashadvance")) {
    const found = firstMatch(["cashAdvanceApprover", "cashadvanceapprover", "cashadvance"]);
    if (found) return found;
  }
  if (key.includes("manager") || key.includes("supervisor")) {
    const found = firstMatch(["supervisor", "head", "sla"]);
    if (found) return found;
  }
  if (key.includes("processor")) {
    const found = firstMatch(["processor"]);
    if (found) return found;
  }
  if (key.includes("hr")) {
    const found = firstMatch(["hr"]);
    if (found) return found;
  }
  if (key.includes("head")) {
    const found = firstMatch(["head"]);
    if (found) return found;
  }
  if (key.includes("sla")) {
    const found = firstMatch(["sla"]);
    if (found) return found;
  }
  if (key.includes("far") || key.includes("finalapprover") || key.includes("finalapproval")) {
    const found = firstMatch(["far", "finalapprover", "finalapprovalapprover"]);
    if (found) return found;
  }
  if (key.includes("approver")) {
    const found = firstMatch(["far", "approver", "supervisor", "head", "sla"]);
    if (found) return found;
  }

  return approverRoles.includes("sla") ? "sla" : approverRoles[0] ?? "";
}

export default function LookupsClient(props: {
  categoryLabels: Record<string, string>;
  groups: LookupAdminGroup[];
  itemsByCategory: Record<string, LookupAdminItem[]>;
  approverRoles: string[];
  approverSyncByCategory: Record<string, string>;
  userInfoBindingByCategory: Record<string, string>;
  userInfoFieldOptions: UserInfoFieldOption[];
}) {
  const {
    categoryLabels,
    groups,
    itemsByCategory,
    approverRoles,
    approverSyncByCategory,
    userInfoBindingByCategory,
    userInfoFieldOptions,
  } = props;
  const [selectedGroupKey, setSelectedGroupKey] = useState(groups[0]?.key ?? "");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [openAddPanelByCategory, setOpenAddPanelByCategory] = useState<Record<string, "bulk" | "single">>({});
  const [selectedRoleByCategory, setSelectedRoleByCategory] = useState<Record<string, string>>({});
  const selectedGroup = groups.find((g) => g.key === selectedGroupKey) ?? groups[0];
  const visibleCategories =
    selectedGroup?.categories.filter((category) =>
      (categoryLabels[category] ?? category).toLowerCase().includes(categoryQuery.toLowerCase()),
    ) ?? [];

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ROLE_DEFAULTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") return;
      const next: Record<string, string> = {};
      for (const [category, value] of Object.entries(parsed)) {
        const role = String(value ?? "").trim();
        if (!role) continue;
        if (!approverRoles.includes(role)) continue;
        next[category] = role;
      }
      setSelectedRoleByCategory(next);
    } catch {
      // Ignore malformed local storage payload.
    }
  }, [approverRoles]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ROLE_DEFAULTS_STORAGE_KEY, JSON.stringify(selectedRoleByCategory));
    } catch {
      // Ignore storage write failures.
    }
  }, [selectedRoleByCategory]);

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Lookup management"
        title="Dropdown values"
        description="Edit the choices users see inside forms. Use this page to keep form options current without touching form logic."
      />

      <AdminHelpPanel title="What this page does">
        Choose a form on the left, then manage the dropdown lists used by that form. Changing values
        here affects future form filling only; it does not rewrite old requests.
        You can also connect a dropdown to user info so values can be synced from the employee directory.
      </AdminHelpPanel>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="admin-panel h-fit p-3 lg:sticky lg:top-24">
          <div className="px-2 pt-1 pb-2">
            <div className="text-xs font-bold uppercase tracking-[0.1em] text-brand-700">Forms</div>
            <div className="mt-1 text-xs text-surface-muted">Select a form area to manage its dropdowns.</div>
          </div>

          <div className="flex flex-col gap-1">
          {groups.map((g) => {
            const isActive = g.key === selectedGroup?.key;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setSelectedGroupKey(g.key)}
                className={[
                  "border px-3 py-2 text-left transition",
                  isActive
                    ? "border-brand-200 bg-brand-50 text-brand-800"
                    : "border-transparent bg-white text-gray-700 hover:bg-gray-50",
                ].join(" ")}
              >
                <div className="font-semibold text-sm">{g.title}</div>
                <div className="line-clamp-2 text-xs text-gray-500">{g.description}</div>
              </button>
            );
          })}
          </div>
        </aside>

        <main className="space-y-4">
          {selectedGroup ? (
            <AdminSection
              title={selectedGroup.title}
              description={selectedGroup.description}
              meta={`${visibleCategories.length} of ${selectedGroup.categories.length} dropdown groups shown`}
            >
              <div className="mb-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-surface-muted">
                    Tip: imported dropdowns can be updated from the importer, then fine-tuned here.
                  </div>
                  <form action={scanRolesLookups}>
                    <PendingSubmitButton
                      type="submit"
                      idleLabel="Scan roles"
                      pendingLabel="Scanning roles..."
                      className="btn-secondary"
                    />
                  </form>
                </div>
                <AdminSearchField
                  value={categoryQuery}
                  onChange={setCategoryQuery}
                  placeholder="Search dropdown groups in this form"
                />
              </div>

              {visibleCategories.length === 0 ? (
                <AdminEmptyState
                  title="No dropdown groups match this search"
                  description="Try a broader search or switch to a different form area."
                />
              ) : (
                <div className="grid gap-4">
                  {visibleCategories.map((cat) => {
                    const categoryLabel = categoryLabels[cat] ?? cat;
                    const inferredDefaultRole = inferDefaultRoleForCategory({
                      category: cat,
                      categoryLabel,
                      approverRoles,
                    });
                    const selectedRole = selectedRoleByCategory[cat];
                    const resolvedRole =
                      approverRoles.length === 0
                        ? ""
                        : selectedRole && approverRoles.includes(selectedRole)
                          ? selectedRole
                          : inferredDefaultRole;

                    return (
                <details
                  key={cat}
                  className="border border-surface-border bg-white p-5"
                >
                  <summary className="flex items-center justify-between cursor-pointer select-none list-none">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-surface-text">{categoryLabel}</h3>
                      <AdminStatusPill tone="neutral">
                        {(itemsByCategory[cat]?.length ?? 0).toString()} entries
                      </AdminStatusPill>
                    </div>
                    <div className="text-[11px] text-surface-muted">
                      {approverSyncByCategory[cat]
                        ? `Synced from approvers: ${formatSyncDateTime(approverSyncByCategory[cat])}`
                        : "Not synced from approvers yet"}
                    </div>
                  </summary>

                  <div className="mt-4">
                    <div className="mb-3 flex justify-end">
                      <div className="flex flex-wrap justify-end gap-2">
                        <form action={syncLookupCategoryFromApprovers}>
                          <input type="hidden" name="category" value={cat} />
                          <PendingSubmitButton
                            type="submit"
                            idleLabel="Sync now"
                            pendingLabel="Syncing..."
                            className="btn-secondary text-xs"
                          />
                        </form>
                        <form action={addLookupFromApproverRole} className="flex items-center gap-2">
                          <input type="hidden" name="category" value={cat} />
                          <select
                            name="approverRole"
                            value={resolvedRole}
                            onChange={(event) => {
                              const nextRole = event.target.value;
                              setSelectedRoleByCategory((prev) => ({ ...prev, [cat]: nextRole }));
                            }}
                            className="field-input min-w-[140px] py-1 text-xs"
                          >
                            {approverRoles.length > 0 ? (
                              approverRoles.map((role) => (
                                <option key={role} value={role}>
                                  {formatRoleLabel(role)}
                                </option>
                              ))
                            ) : (
                              <option value="" disabled>
                                No approver roles
                              </option>
                            )}
                          </select>
                          <PendingSubmitButton
                            type="submit"
                            idleLabel="Add from approver role"
                            pendingLabel="Adding..."
                            className="btn-secondary text-xs"
                            disabled={approverRoles.length === 0}
                          />
                        </form>
                        <form
                          action={deleteLookupCategory}
                          onSubmit={(e) => {
                            if (!confirm("Delete this whole dropdown group and all its values?")) e.preventDefault();
                          }}
                        >
                          <input type="hidden" name="category" value={cat} />
                          <PendingSubmitButton
                            type="submit"
                            idleLabel="Delete dropdown group"
                            pendingLabel="Deleting group..."
                            className="border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                          />
                        </form>
                      </div>
                    </div>
                    <div className="mb-4 rounded border border-surface-border bg-slate-50 p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-surface-text">User info connection</p>
                          <p className="text-xs text-surface-muted">
                            Connect this dropdown to a field from the employee directory, then sync those values into the list.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {userInfoBindingByCategory[cat] ? (
                            <AdminStatusPill tone="brand">
                              Connected: {userInfoFieldOptions.find((item) => item.value === userInfoBindingByCategory[cat])?.label ?? userInfoBindingByCategory[cat]}
                            </AdminStatusPill>
                          ) : (
                            <AdminStatusPill tone="neutral">Not connected</AdminStatusPill>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                        <form action={updateLookupCategoryUserInfoBinding} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                          <input type="hidden" name="category" value={cat} />
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">
                              User info field
                            </label>
                            <select
                              name="userInfoField"
                              defaultValue={userInfoBindingByCategory[cat] ?? ""}
                              className="field-input"
                            >
                              <option value="">No connection</option>
                              {userInfoFieldOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <PendingSubmitButton
                            type="submit"
                            idleLabel="Save connection"
                            pendingLabel="Saving..."
                            className="btn-secondary"
                          />
                        </form>
                        <form action={syncLookupCategoryFromUserInfo}>
                          <input type="hidden" name="category" value={cat} />
                          <PendingSubmitButton
                            type="submit"
                            idleLabel="Sync from user info"
                            pendingLabel="Syncing..."
                            className="btn-primary"
                            disabled={!userInfoBindingByCategory[cat]}
                          />
                        </form>
                      </div>
                    </div>
                    <div className="mb-4 grid gap-3 lg:grid-cols-2">
                      <details
                        className={`rounded border border-surface-border p-3 ${
                          (openAddPanelByCategory[cat] ?? "bulk") === "bulk" ? "bg-slate-50" : "bg-white"
                        }`}
                        open={(openAddPanelByCategory[cat] ?? "bulk") === "bulk"}
                        onToggle={(event) => {
                          if ((event.currentTarget as HTMLDetailsElement).open) {
                            setOpenAddPanelByCategory((prev) => ({ ...prev, [cat]: "bulk" }));
                          }
                        }}
                      >
                        <summary className="text-sm font-semibold text-surface-text">Bulk add</summary>
                        <form action={addLookupBulk} className="mt-3">
                          <PendingFormState className="space-y-2">
                            <input type="hidden" name="category" value={cat} />
                            <textarea
                              name="bulkValues"
                              rows={6}
                              placeholder={"One value per line\nExample:\nOption A\nOption B\nOption C"}
                              className="field-input font-mono text-xs"
                            />
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs text-surface-muted">Duplicates are auto-skipped.</p>
                              <PendingSubmitButton
                                type="submit"
                                idleLabel="Bulk add"
                                pendingLabel="Adding..."
                                className="btn-secondary"
                              />
                            </div>
                          </PendingFormState>
                        </form>
                      </details>

                      <details
                        className={`rounded border border-surface-border p-3 ${
                          (openAddPanelByCategory[cat] ?? "bulk") === "single" ? "bg-slate-50" : "bg-white"
                        }`}
                        open={(openAddPanelByCategory[cat] ?? "bulk") === "single"}
                        onToggle={(event) => {
                          if ((event.currentTarget as HTMLDetailsElement).open) {
                            setOpenAddPanelByCategory((prev) => ({ ...prev, [cat]: "single" }));
                          }
                        }}
                      >
                        <summary className="text-sm font-semibold text-surface-text">Single add value</summary>
                        <form action={addLookup} className="mt-3">
                          <PendingFormState className="space-y-2">
                            <input type="hidden" name="category" value={cat} />
                            <p className="text-xs text-surface-muted">
                              Add either a plain value, or enter Name + Email for people-based dropdowns.
                            </p>
                            <input
                              type="text"
                              name="value"
                              placeholder="Value (required if no email)"
                              className="field-input w-full"
                            />
                            <input
                              type="text"
                              name="name"
                              placeholder="Name (optional)"
                              className="field-input w-full"
                            />
                            <input
                              type="email"
                              name="email"
                              placeholder="Email (optional)"
                              className="field-input w-full"
                            />
                            <div className="flex justify-end">
                              <PendingSubmitButton
                                type="submit"
                                idleLabel="Add value"
                                pendingLabel="Adding..."
                                className="btn-primary"
                              />
                            </div>
                          </PendingFormState>
                        </form>
                      </details>
                    </div>

                    {!itemsByCategory[cat] || itemsByCategory[cat].length === 0 ? (
                      <AdminEmptyState
                        title="No values yet"
                        description="Add the first value above, or load default setup data from the overview page."
                      />
                    ) : (
                      <ul className="divide-y divide-surface-border">
                        {itemsByCategory[cat].map((item) => (
                          <li
                            key={item.id}
                            className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 flex-1">
                              <div
                                className={`text-sm break-words ${
                                  item.isActive
                                    ? "text-gray-800"
                                    : "text-gray-400 line-through"
                                }`}
                              >
                                {item.label ? `${item.label} <${item.value}>` : item.value}
                              </div>
                              <details className="mt-1">
                                <summary className="text-xs text-gray-500 hover:text-brand-700 cursor-pointer select-none">
                                  Edit value
                                </summary>
                                <form action={updateLookup} className="mt-2">
                                  <PendingFormState className="flex gap-2">
                                    <input type="hidden" name="id" value={item.id} />
                                    <input
                                      type="text"
                                      name="value"
                                      defaultValue={item.value}
                                      required
                                      className="field-input flex-1"
                                    />
                                    <PendingSubmitButton
                                      type="submit"
                                      idleLabel="Save"
                                      pendingLabel="Updating..."
                                      className="btn-secondary"
                                    />
                                  </PendingFormState>
                                </form>
                              </details>
                            </div>
                            <div className="flex gap-1">
                              <form action={toggleLookup}>
                                <input type="hidden" name="id" value={item.id} />
                                <PendingSubmitButton
                                  type="submit"
                                  idleLabel={item.isActive ? "Deactivate" : "Activate"}
                                  pendingLabel="Working..."
                                  className="text-xs text-gray-500 hover:text-brand-700 px-2 py-1 rounded transition"
                                />
                              </form>
                              <form action={deleteLookup}>
                                <input type="hidden" name="id" value={item.id} />
                                <PendingSubmitButton
                                  type="submit"
                                  idleLabel="Delete"
                                  pendingLabel="Deleting..."
                                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded transition"
                                />
                              </form>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
                    );
                  })}
                </div>
              )}
            </AdminSection>
        ) : (
            <AdminEmptyState
              title="No form groups configured"
              description="This usually means there are no lookup groups loaded yet."
            />
        )}
        </main>
      </div>
    </div>
  );
}
