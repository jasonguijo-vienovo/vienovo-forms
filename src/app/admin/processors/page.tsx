import { connectMongo } from "@/lib/db/mongo";
import { Approver } from "@/models/Approver";
import { addApprover, deleteApprover, toggleApprover, updateApprover } from "../approvers/actions";

export default async function ProcessorsPage() {
  await connectMongo();
  const processors = await Approver.find({ roles: "processor" }).sort({ name: 1 }).lean();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Manage processors</h1>
        <p className="text-gray-500 text-sm mt-1">
          Final processors for request flows. Imported form sync can add people here when it finds a
          processor field in the spreadsheet-backed options.
        </p>
      </div>

      <section className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
        <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-4">
          Add a processor
        </h2>
        <form
          action={addApprover}
          className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_auto] gap-2"
        >
          <input type="hidden" name="role_processor" value="on" />
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
        </form>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3">
            Processor roster
          </h2>
          <span className="text-xs text-gray-400">{processors.length} people</span>
        </div>

        {processors.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-6">
            No processors yet. Add one above or let imported form sync create processor candidates.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-brand-50">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {processors.map((processor) => (
                  <tr key={String(processor._id)}>
                    <td className="py-2.5 pr-3 font-medium text-gray-800">{processor.name}</td>
                    <td className="py-2.5 pr-3">
                      <form action={updateApprover} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={String(processor._id)} />
                        <input type="hidden" name="department" value={processor.department || ""} />
                        <input type="hidden" name="role_processor" value="on" />
                        <input
                          type="email"
                          name="email"
                          defaultValue={processor.email}
                          placeholder="email@vienovo.ph"
                          className={`px-2 py-1 border-[1.5px] rounded text-xs w-56 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none ${
                            processor.emailNeedsReview
                              ? "border-amber-300 bg-amber-50"
                              : "border-gray-200"
                          }`}
                        />
                        <button type="submit" className="text-xs text-brand-700 hover:underline">
                          save
                        </button>
                      </form>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`text-xs font-semibold ${
                          processor.isActive ? "text-green-700" : "text-gray-400"
                        }`}
                      >
                        {processor.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <form action={toggleApprover} className="inline">
                        <input type="hidden" name="id" value={String(processor._id)} />
                        <button
                          type="submit"
                          className="text-xs text-gray-500 hover:text-brand-700 px-2 py-1 transition"
                        >
                          {processor.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                      <form action={deleteApprover} className="inline">
                        <input type="hidden" name="id" value={String(processor._id)} />
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
