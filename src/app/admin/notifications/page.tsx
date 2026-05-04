import { BellRing, RotateCcw, Save } from "lucide-react";
import { PendingFormState } from "@/components/pending-form-state";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { listNotificationFlowSettings } from "@/lib/notifications/flow";
import { resetNotificationFlow, saveNotificationFlow } from "./actions";

export default async function NotificationFlowPage() {
  const flows = await listNotificationFlowSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Notification flow</h1>
        <p className="mt-1 text-sm text-gray-500">
          Control who gets submission and approval emails for each form. These settings layer on top
          of the current approval logic without changing request storage or routing.
        </p>
      </div>

      <div className="grid gap-4">
        {flows.map((flow) => (
          <section
            key={flow.formSlug}
            className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-brand-50 p-2 text-brand-700">
                    <BellRing className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">{flow.formName}</h2>
                    <p className="text-xs text-gray-400">
                      <code>{flow.formSlug}</code>
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-500">
                  Default recipients still come from the form logic. Extra recipients below are added as
                  CC-style recipients to the same outgoing email.
                </p>
              </div>

              <form action={resetNotificationFlow}>
                <input type="hidden" name="formSlug" value={flow.formSlug} />
                <input type="hidden" name="formName" value={flow.formName} />
                <PendingSubmitButton
                  type="submit"
                  idleLabel={
                    <span className="inline-flex items-center gap-2">
                      <RotateCcw className="h-4 w-4" />
                      <span>Reset defaults</span>
                    </span>
                  }
                  pendingLabel="Resetting..."
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                />
              </form>
            </div>

            <form action={saveNotificationFlow} className="mt-4">
              <PendingFormState className="space-y-4">
                <input type="hidden" name="formSlug" value={flow.formSlug} />
                <input type="hidden" name="formName" value={flow.formName} />

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <ToggleField
                    name="isActive"
                    defaultChecked={flow.isActive}
                    label="Notifications active"
                    description="Master switch for this form."
                  />
                  <ToggleField
                    name="notifyOnSubmit"
                    defaultChecked={flow.notifyOnSubmit}
                    label="On submit"
                    description="Submission or resubmission email."
                  />
                  <ToggleField
                    name="notifyNextApprover"
                    defaultChecked={flow.notifyNextApprover}
                    label="Next approver"
                    description="Notify the next approver when a step advances."
                  />
                  <ToggleField
                    name="notifySubmitterOnApproved"
                    defaultChecked={flow.notifySubmitterOnApproved}
                    label="Final approval"
                    description="Notify the requester when fully approved."
                  />
                  <ToggleField
                    name="notifySubmitterOnRejected"
                    defaultChecked={flow.notifySubmitterOnRejected}
                    label="Rejection"
                    description="Notify the requester when rejected."
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                      Extra recipients
                    </label>
                    <textarea
                      name="extraRecipients"
                      rows={4}
                      defaultValue={flow.extraRecipients.join(", ")}
                      placeholder="finance@vienovo.ph, audit@vienovo.ph"
                      className="field-input"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Use commas, semicolons, or new lines. These recipients are added to enabled
                      emails for this form.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-gray-700">Notes</label>
                    <textarea
                      name="notes"
                      rows={4}
                      defaultValue={flow.notes}
                      placeholder="Example: Keep accounting looped in after rollout."
                      className="field-input"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <PendingSubmitButton
                    type="submit"
                    idleLabel={
                      <span className="inline-flex items-center gap-2">
                        <Save className="h-4 w-4" />
                        <span>Save flow</span>
                      </span>
                    }
                    pendingLabel="Saving flow..."
                    className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                  />
                </div>
              </PendingFormState>
            </form>
          </section>
        ))}
      </div>
    </div>
  );
}

function ToggleField({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="rounded-xl border border-brand-100 bg-brand-50/30 p-4">
      <span className="flex items-start gap-3">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="mt-1 accent-brand-600"
        />
        <span>
          <span className="block text-sm font-semibold text-gray-800">{label}</span>
          <span className="mt-1 block text-xs text-gray-500">{description}</span>
        </span>
      </span>
    </label>
  );
}
