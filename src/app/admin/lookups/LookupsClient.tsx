"use client";

import { useMemo, useState } from "react";
import { addLookup, deleteLookup, toggleLookup, updateLookup } from "./actions";

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
  const [selectedGroupKey, setSelectedGroupKey] = useState(groups[0]?.key ?? "");

  const selectedGroup = useMemo(
    () => groups.find((g) => g.key === selectedGroupKey) ?? groups[0],
    [groups, selectedGroupKey],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="bg-white rounded-2xl shadow-sm border border-brand-100 p-3 h-fit lg:sticky lg:top-24">
        <div className="px-2 pt-1 pb-2">
          <div className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700">
            Forms
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Select a form to manage dropdowns.
          </div>
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
                  "text-left px-3 py-2 rounded-xl border transition",
                  isActive
                    ? "bg-brand-50 border-brand-200 text-brand-800"
                    : "bg-white border-transparent hover:bg-gray-50 text-gray-700",
                ].join(" ")}
              >
                <div className="font-semibold text-sm">{g.title}</div>
                <div className="text-xs text-gray-500 line-clamp-2">
                  {g.description}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="space-y-4">
        {selectedGroup ? (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-bold text-gray-800">
                  {selectedGroup.title}
                </h2>
                <p className="text-sm text-gray-500">{selectedGroup.description}</p>
              </div>
            </div>

            <div className="grid gap-4">
              {selectedGroup.categories.map((cat, idx) => (
                <details
                  key={cat}
                  className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5"
                  open={idx === 0}
                >
                  <summary className="flex items-center justify-between cursor-pointer select-none list-none">
                    <div className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3">
                      {categoryLabels[cat] ?? cat}
                    </div>
                    <span className="text-xs text-gray-400">
                      {(itemsByCategory[cat]?.length ?? 0).toString()} entries
                    </span>
                  </summary>

                  <div className="mt-4">
                    <form action={addLookup} className="flex gap-2 mb-4">
                      <input type="hidden" name="category" value={cat} />
                      <input
                        type="text"
                        name="value"
                        placeholder="Add a new value..."
                        required
                        className="flex-1 px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
                      />
                      <button
                        type="submit"
                        className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 rounded-lg text-sm transition"
                      >
                        Add
                      </button>
                    </form>

                    {!itemsByCategory[cat] || itemsByCategory[cat].length === 0 ? (
                      <p className="text-sm text-gray-400 italic text-center py-4">
                        No entries yet. Add one above or run seed from{" "}
                        <a href="/admin" className="text-brand-700 underline">
                          Admin
                        </a>
                        .
                      </p>
                    ) : (
                      <ul className="divide-y divide-brand-50">
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
                                <form
                                  action={updateLookup}
                                  className="flex gap-2 mt-2"
                                >
                                  <input type="hidden" name="id" value={item.id} />
                                  <input
                                    type="text"
                                    name="value"
                                    defaultValue={item.value}
                                    required
                                    className="flex-1 px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
                                  />
                                  <button
                                    type="submit"
                                    className="bg-gray-900 hover:bg-black text-white font-semibold px-4 rounded-lg text-sm transition"
                                  >
                                    Update
                                  </button>
                                </form>
                              </details>
                            </div>
                            <div className="flex gap-1">
                              <form action={toggleLookup}>
                                <input type="hidden" name="id" value={item.id} />
                                <button
                                  type="submit"
                                  className="text-xs text-gray-500 hover:text-brand-700 px-2 py-1 rounded transition"
                                >
                                  {item.isActive ? "Deactivate" : "Activate"}
                                </button>
                              </form>
                              <form action={deleteLookup}>
                                <input type="hidden" name="id" value={item.id} />
                                <button
                                  type="submit"
                                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded transition"
                                >
                                  Delete
                                </button>
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
          </>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5 text-sm text-gray-500">
            No groups configured.
          </div>
        )}
      </main>
    </div>
  );
}

