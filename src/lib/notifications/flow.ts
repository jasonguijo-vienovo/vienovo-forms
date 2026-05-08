import { connectMongo } from "@/lib/db/mongo";
import { getAllFormDefinitionsForAdmin } from "@/lib/form-definitions";
import { NotificationFlow } from "@/models/NotificationFlow";
import { Approver } from "@/models/Approver";
import { NotificationDeliveryLog } from "@/models/NotificationDeliveryLog";
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

function isValidEmail(input: string) {
  if (!input || input.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

function extractLastName(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function prependGreeting(opts: {
  body: string;
  roleHint?: string;
  lastName?: string;
  formName: string;
  formSlug: string;
}) {
  const ln = opts.lastName ? ` ${opts.lastName}` : "";
  const greeting =
    opts.roleHint === "hr"
      ? `Dear, HR${ln}`
      : opts.roleHint
        ? `Dear, ${opts.roleHint}${ln}`
        : `Dear,${ln}`;
  return `${greeting}\n\nForm: ${opts.formName} (${opts.formSlug})\n\n${opts.body}`;
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
  if (!eventEnabled(flow, opts.event)) {
    await NotificationDeliveryLog.create({
      formSlug: opts.formSlug,
      formName: opts.formName,
      event: opts.event,
      recipient: "",
      subject: opts.subject,
      status: "skipped",
      error: "Notification event disabled by flow settings",
    });
    return false;
  }

  const recipients = normalizeRecipients([...normalizeRecipients(opts.to), ...flow.extraRecipients]).filter(
    isValidEmail
  );
  if (recipients.length === 0) {
    await NotificationDeliveryLog.create({
      formSlug: opts.formSlug,
      formName: opts.formName,
      event: opts.event,
      recipient: "",
      subject: opts.subject,
      status: "skipped",
      error: "No valid recipients",
    });
    return false;
  }

  const approvers = await Approver.find({ email: { $in: recipients } }).select({ email: 1, name: 1, roles: 1 }).lean();
  const approverByEmail = new Map(approvers.map((item) => [String(item.email || "").toLowerCase(), item]));

  for (const recipient of recipients) {
    const profile = approverByEmail.get(recipient);
    const roleHint = profile?.roles?.includes("hr") ? "hr" : profile?.roles?.[0] || "";
    const lastName = extractLastName(String(profile?.name || ""));
    const baseText = opts.text || "";
    const finalText = prependGreeting({
      body: baseText,
      roleHint,
      lastName,
      formName: opts.formName,
      formSlug: opts.formSlug,
    });
    try {
      await sendNotificationEmail({
        to: recipient,
        subject: opts.subject,
        text: finalText,
        html: opts.html,
      });
      await NotificationDeliveryLog.create({
        formSlug: opts.formSlug,
        formName: opts.formName,
        event: opts.event,
        recipient,
        subject: opts.subject,
        status: "sent",
      });
    } catch (error) {
      await NotificationDeliveryLog.create({
        formSlug: opts.formSlug,
        formName: opts.formName,
        event: opts.event,
        recipient,
        subject: opts.subject,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown notification failure",
      });
      throw error;
    }
  }

  return true;
}
