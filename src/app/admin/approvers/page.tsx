import { connectMongo } from "@/lib/db/mongo";
import { Approver, APPROVER_ROLES } from "@/models/Approver";
import {
  addApprover,
  updateApprover,
  toggleApprover,
  deleteApprover,
} from "./actions";

export default async function ApproversPage() {
  await connectMongo();
  const all = await Approver.find({}).sort({ name: 1 }).lean();
  const needsReview = all.filter((a) => a.emailNeedsReview).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Manage approvers</h1>
        <p className="text-gray-500 text-sm mt-1">
          People who can approve or process requests. Each person can serve as
          supervisor, department head, cash advance approver, or final approver.
        </p>
      </div>

      {needsReview > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          <strong>{needsReview}</strong>{" "}
          {needsReview === 1 ? "approver has" : "approvers have"} placeholder or
          missing email addresses. Fill in the correct emails before activating
          notifications.
        </div>
      )}

      <section className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
        <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-4">
          Add a new approver
        </h2>
        <form
          action={addApprover}
          className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_auto] gap-2"
        >
          <input
            type="text"
            name="name"
            placeholder="Full name"
            required
            className="px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
          />
          <input
            type="email"
            name="email"
            placeholder="email@vienovo.ph"
            className="px-3 py-2 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none"
          />
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 rounded-lg text-sm transition"
          >
            Add
          </button>
          <div className="sm:col-span-3 flex flex-wrap gap-3 text-sm text-gray-600">
            {APPROVER_ROLES.map((r) => (
              <label key={r} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  name={`role_${r}`}
                  className="accent-brand-600"
                />
                <span className="capitalize">{r}</span>
              </label>
            ))}
          </div>
        </form>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3">
            Approver roster
          </h2>
          <span className="text-xs text-gray-400">{all.length} people</span>
        </div>

        {all.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-6">
            No approvers yet. Run seed from{" "}
            <a href="/admin" className="text-brand-700 underline">
              Admin
            </a>{" "}
            or add one above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-brand-50">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Roles</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {all.map((a) => (
                  <tr key={String(a._id)}>
                    <td className="py-2.5 pr-3 font-medium text-gray-800">
                      {a.name}
                    </td>
                    <td className="py-2.5 pr-3">
                      <form
                        action={updateApprover}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input
                          type="hidden"
                          name="id"
                          value={String(a._id)}
                        />
                        <input
                          type="hidden"
                          name="department"
                          value={a.department || ""}
                        />
                        {APPROVER_ROLES.map((r) => (
                          <input
                            key={r}
                            type="hidden"
                            name={`role_${r}`}
                            value={a.roles.includes(r) ? "on" : ""}
                          />
                        ))}
                        <input
                          type="email"
                          name="email"
                          defaultValue={a.email}
                          placeholder="email@vienovo.ph"
                          className={`px-2 py-1 border-[1.5px] rounded text-xs w-56 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none ${
                            a.emailNeedsReview
                              ? "border-amber-300 bg-amber-50"
                              : "border-gray-200"
                          }`}
                        />
                        <button
                          type="submit"
                          className="text-xs text-brand-700 hover:underline"
                        >
                          save
                        </button>
                      </form>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-gray-600">
                      {a.roles.map((r) => (
                        <span
                          key={r}
                          className="inline-block bg-brand-50 text-brand-700 rounded px-1.5 py-0.5 mr-1 capitalize font-semibold"
                        >
                          {r}
                        </span>
                      ))}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`text-xs font-semibold ${
                          a.isActive ? "text-green-700" : "text-gray-400"
                        }`}
                      >
                        {a.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <form
                        action={toggleApprover}
                        className="inline"
                      >
                        <input
                          type="hidden"
                          name="id"
                          value={String(a._id)}
                        />
                        <button
                          type="submit"
                          className="text-xs text-gray-500 hover:text-brand-700 px-2 py-1 transition"
                        >
                          {a.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                      <form action={deleteApprover} className="inline">
                        <input
                          type="hidden"
                          name="id"
                          value={String(a._id)}
                        />
                        <button
                          type="submit"
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 transition"
                        >
                          Delete
                        </button>
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
