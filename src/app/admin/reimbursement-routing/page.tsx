import { connectMongo } from "@/lib/db/mongo";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { ReimbursementRoute } from "@/models/ReimbursementRoute";
import { addRoute, deleteRoute, toggleRoute, updateRoute } from "./actions";

export default async function ReimbursementRoutingPage() {
  await connectMongo();
  const routes = await ReimbursementRoute.find({})
    .sort({ department: 1, costCenter: 1, location: 1 })
    .lean();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          Reimbursement routing
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Controls how Department + Cost Center + Location auto-fills the
          Immediate Superior and Department Head on the Reimbursement form.
        </p>
      </div>

      <section className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
        <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-4">
          Add / upsert a route
        </h2>
        <form action={addRoute} className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <input
            name="department"
            placeholder="Department"
            required
            className="px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
          />
          <input
            name="costCenter"
            placeholder="Cost Center"
            required
            className="px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
          />
          <input
            name="location"
            placeholder="Location"
            required
            className="px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
          />

          <input
            name="supervisorEmail"
            placeholder="Immediate Superior email"
            className="px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
          />
          <input
            name="supervisorName"
            placeholder="Immediate Superior name"
            className="px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
          />
          <div className="lg:col-span-1 flex items-center justify-end">
            <PendingSubmitButton
              type="submit"
              idleLabel="Add / Update"
              pendingLabel="Saving..."
              className="w-full lg:w-auto bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
            />
          </div>

          <input
            name="headEmail"
            placeholder="Department Head email"
            className="px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
          />
          <input
            name="headName"
            placeholder="Department Head name"
            className="px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
          />
          <div className="hidden lg:block" />
        </form>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3">
            Routes
          </h2>
          <span className="text-xs text-gray-400">{routes.length} entries</span>
        </div>

        {routes.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-6">
            No routes yet. Add one above or seed from{" "}
            <a href="/admin" className="text-brand-700 underline">
              Admin
            </a>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-brand-50">
                  <th className="py-2 pr-3">Department</th>
                  <th className="py-2 pr-3">Cost Center</th>
                  <th className="py-2 pr-3">Location</th>
                  <th className="py-2 pr-3">Immediate Superior</th>
                  <th className="py-2 pr-3">Department Head</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {routes.map((r) => (
                  <tr key={String(r._id)} className="align-top">
                    <td className="py-2.5 pr-3 font-medium text-gray-800">
                      {r.department}
                    </td>
                    <td className="py-2.5 pr-3">{r.costCenter}</td>
                    <td className="py-2.5 pr-3">{r.location}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-600">
                      <div className="font-semibold text-gray-800">
                        {r.supervisorName || "—"}
                      </div>
                      <div>{r.supervisorEmail || "—"}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-gray-600">
                      <div className="font-semibold text-gray-800">
                        {r.headName || "—"}
                      </div>
                      <div>{r.headEmail || "—"}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`text-xs font-semibold ${
                          r.isActive ? "text-green-700" : "text-gray-400"
                        }`}
                      >
                        {r.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <details className="inline-block text-left mr-2">
                        <summary className="text-xs text-gray-500 hover:text-brand-700 px-2 py-1 cursor-pointer select-none">
                          Edit
                        </summary>
                        <div className="mt-2 p-3 border border-brand-100 rounded-xl bg-white shadow-sm w-[360px]">
                          <form action={updateRoute} className="space-y-2">
                            <input type="hidden" name="id" value={String(r._id)} />
                            <input
                              name="department"
                              defaultValue={r.department}
                              required
                              className="w-full px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
                            />
                            <input
                              name="costCenter"
                              defaultValue={r.costCenter}
                              required
                              className="w-full px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
                            />
                            <input
                              name="location"
                              defaultValue={r.location}
                              required
                              className="w-full px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
                            />
                            <input
                              name="supervisorEmail"
                              defaultValue={r.supervisorEmail}
                              placeholder="Immediate Superior email"
                              className="w-full px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
                            />
                            <input
                              name="supervisorName"
                              defaultValue={r.supervisorName}
                              placeholder="Immediate Superior name"
                              className="w-full px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
                            />
                            <input
                              name="headEmail"
                              defaultValue={r.headEmail}
                              placeholder="Department Head email"
                              className="w-full px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
                            />
                            <input
                              name="headName"
                              defaultValue={r.headName}
                              placeholder="Department Head name"
                              className="w-full px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
                            />
                            <PendingSubmitButton
                              type="submit"
                              idleLabel="Save"
                              pendingLabel="Saving..."
                              className="w-full bg-gray-900 hover:bg-black text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
                            />
                          </form>
                        </div>
                      </details>

                      <form action={toggleRoute} className="inline">
                        <input type="hidden" name="id" value={String(r._id)} />
                        <PendingSubmitButton
                          type="submit"
                          idleLabel={r.isActive ? "Deactivate" : "Activate"}
                          pendingLabel="Updating..."
                          className="text-xs text-gray-500 hover:text-brand-700 px-2 py-1 transition"
                        />
                      </form>
                      <form action={deleteRoute} className="inline">
                        <input type="hidden" name="id" value={String(r._id)} />
                        <PendingSubmitButton
                          type="submit"
                          idleLabel="Delete"
                          pendingLabel="Deleting..."
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 transition"
                        />
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

