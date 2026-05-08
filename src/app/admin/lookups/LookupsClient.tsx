"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminEmptyState, AdminHelpPanel, AdminPageHeader, AdminSection, AdminStatusPill } from "@/components/admin-ui";
import { AdminSearchField } from "@/components/admin-ui-client";
import { PendingFormState } from "@/components/pending-form-state";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { addLookup, addLookupBulk, deleteLookup, toggleLookup, updateLookup } from "./actions";

export type LookupAdminItem = {
  id: string;
  value: string;
  isActive: boolean;
};

export type LookupAdminGroup = {
  key: string;
  title: string;
  description: string;
  categories: string[];
};

export default function LookupsClient(props: {
  categoryLabels: Record<string, string>;
  groups: LookupAdminGroup[];
  itemsByCategory: Record<string, LookupAdminItem[]>;
}) {
  const { categoryLabels, groups, itemsByCategory } = props;
  const router = useRouter();
  const [isScanning, startScan] = useTransition();
  const [selectedGroupKey, setSelectedGroupKey] = useState(groups[0]?.key ?? "");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [openAddPanelByCategory, setOpenAddPanelByCategory] = useState<Record<string, "bulk" | "single">>({});
  const selectedGroup = groups.find((g) => g.key === selectedGroupKey) ?? groups[0];
  const visibleCategories =
    selectedGroup?.categories.filter((category) =>
      (categoryLabels[category] ?? category).toLowerCase().includes(categoryQuery.toLowerCase()),
    ) ?? [];

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
                  <button
                    type="button"
                    onClick={() => startScan(() => router.refresh())}
                    disabled={isScanning}
                    className="btn-secondary"
                  >
                    {isScanning ? "Scanning..." : "Scan dropdowns"}
                  </button>
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
                  {visibleCategories.map((cat, idx) => (
                <details
                  key={cat}
                  className="border border-surface-border bg-white p-5"
                >
                  <summary className="flex items-center justify-between cursor-pointer select-none list-none">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-surface-text">{categoryLabels[cat] ?? cat}</h3>
                      <AdminStatusPill tone="neutral">
                        {(itemsByCategory[cat]?.length ?? 0).toString()} entries
                      </AdminStatusPill>
                    </div>
                  </summary>

                  <div className="mt-4">
                    <div className="mb-4 grid gap-3 lg:grid-cols-2">
                      <details
                        className="rounded border border-surface-border bg-slate-50 p-3"
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
                        className="rounded border border-surface-border bg-slate-50 p-3"
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
                            <input
                              type="text"
                              name="value"
                              placeholder="Add one value..."
                              required
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
                                {item.value}
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
                  ))}
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

