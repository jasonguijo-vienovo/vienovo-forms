import { connectMongo } from "@/lib/db/mongo";
import { getAllFormDefinitionsForAdmin } from "@/lib/form-definitions";
import { NotificationFlow } from "@/models/NotificationFlow";
import { sendNotificationEmail } from "@/lib/notifications/email";

export type NotificationEvent = "submitted" | "resubmitted" | "next-approver" | "approved" | "rejected";

export type NotificationFlowSettings = {
  formSlug: string;
  formName: string;
  isActive: boolean;
  notifyOnSubmit: boolean;
  notifyNextApprover: boolean;
  notifySubmitterOnApproved: boolean;
  notifySubmitterOnRejected: boolean;
  extraRecipients: string[];
  notes: string;
};

const DEFAULT_SETTINGS: Omit<NotificationFlowSettings, "formSlug" | "formName"> = {
  isActive: true,
  notifyOnSubmit: true,
  notifyNextApprover: true,
  notifySubmitterOnApproved: true,
  notifySubmitterOnRejected: true,
  extraRecipients: [],
  notes: "",
};

function normalizeSettings(input: Partial<NotificationFlowSettings> & Pick<NotificationFlowSettings, "formSlug" | "formName">) {
  return {
    ...DEFAULT_SETTINGS,
    ...input,
    formSlug: input.formSlug,
    formName: input.formName,
    extraRecipients: Array.from(
      new Set(
        (input.extraRecipients ?? [])
          .map((email) => String(email ?? "").trim().toLowerCase())
          .filter(Boolean)
      )
    ),
  } satisfies NotificationFlowSettings;
}

function eventEnabled(flow: NotificationFlowSettings, event: NotificationEvent) {
  if (!flow.isActive) return false;
  if (event === "submitted" || event === "resubmitted") return flow.notifyOnSubmit;
  if (event === "next-approver") return flow.notifyNextApprover;
  if (event === "approved") return flow.notifySubmitterOnApproved;
  if (event === "rejected") return flow.notifySubmitterOnRejected;
  return true;
}

function normalizeRecipients(recipients: string | string[]) {
  return Array.from(
    new Set(
      (Array.isArray(recipients) ? recipients : [recipients])
        .map((email) => String(email ?? "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export async function listNotificationFlowSettings() {
  await connectMongo();
  const [forms, docs] = await Promise.all([
    getAllFormDefinitionsForAdmin(),
    NotificationFlow.find({}).sort({ formName: 1 }).lean(),
  ]);

  const docBySlug = new Map(docs.map((doc) => [doc.formSlug, doc]));

  return forms.map((form) =>
    normalizeSettings({
      formSlug: form.slug,
      formName: form.name,
      ...(docBySlug.get(form.slug) ?? {}),
    })
  );
}

export async function getNotificationFlowSettings(formSlug: string, formName: string) {
  await connectMongo();
  const doc = await NotificationFlow.findOne({ formSlug }).lean();
  return normalizeSettings({
    formSlug,
    formName,
    ...(doc ?? {}),
  });
}

export async function sendFlowNotification(opts: {
  formSlug: string;
  formName: string;
  event: NotificationEvent;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}) {
  const flow = await getNotificationFlowSettings(opts.formSlug, opts.formName);
  if (!eventEnabled(flow, opts.event)) return false;

  const recipients = normalizeRecipients([...normalizeRecipients(opts.to), ...flow.extraRecipients]);
  if (recipients.length === 0) return false;

  await sendNotificationEmail({
    to: recipients,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });

  return true;
}
