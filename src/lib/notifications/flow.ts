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

const APPROVER_CACHE_TTL_MS = 60_000;
type ApproverLookupRow = {
  email?: string;
  name?: string;
  roles?: string[];
};
const approverCache = new Map<string, { at: number; value: ApproverLookupRow[] }>();

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

function cacheKeyForRecipients(recipients: string[]) {
  return recipients.slice().sort().join("|");
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

function escapeHtml(input: string) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapBrandedEmail(opts: {
  appUrl: string;
  title: string;
  bodyHtml: string;
  ctaUrl?: string;
  ctaLabel?: string;
  accent?: "brand" | "success" | "warn";
}) {
  const logoUrl = opts.appUrl ? `${opts.appUrl}/icon` : "";
  const accentColor = opts.accent === "success" ? "#0f5f35" : opts.accent === "warn" ? "#b45309" : "#1e293b";
  const ctaHtml =
    opts.ctaUrl
      ? `<p style="margin:20px 0 0;">
          <a href="${opts.ctaUrl}" style="display:inline-block;padding:11px 16px;border-radius:10px;background:${accentColor};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">
            ${escapeHtml(opts.ctaLabel || "Open")}
          </a>
        </p>`
      : "";

  return `
    <div style="margin:0;padding:24px;background:#f3f6fb;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f0;border-radius:14px;overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;background:linear-gradient(135deg,#0f172a,#1e3a5f);color:#fff;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="vertical-align:middle;">
                  <div style="font-size:16px;font-weight:700;letter-spacing:.2px;">Vienovo Forms</div>
                  <div style="font-size:12px;opacity:.86;">Workflow Notification</div>
                </td>
                <td style="text-align:right;vertical-align:middle;">
                  ${logoUrl ? `<img src="${logoUrl}" alt="Vienovo" width="38" height="38" style="border-radius:10px;background:#fff;padding:4px;" />` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px;">
            <h2 style="margin:0 0 10px;font-size:18px;line-height:1.35;color:#0f172a;">${escapeHtml(opts.title)}</h2>
            <div style="font-size:14px;line-height:1.65;color:#334155;">
              ${opts.bodyHtml}
            </div>
            ${ctaHtml}
          </td>
        </tr>
      </table>
    </div>
  `;
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
  ctaUrl?: string;
  ctaLabel?: string;
}) {
  const startedAt = Date.now();
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

  const key = cacheKeyForRecipients(recipients);
  const cached = approverCache.get(key);
  const isFresh = cached && Date.now() - cached.at < APPROVER_CACHE_TTL_MS;
  const approvers: ApproverLookupRow[] = isFresh
    ? cached.value
    : await Approver.find({ email: { $in: recipients } }).select({ email: 1, name: 1, roles: 1 }).lean();
  if (!isFresh) approverCache.set(key, { at: Date.now(), value: approvers });
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
    const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
    const bodyHtml = opts.html || `<p style="margin:0;">${escapeHtml(finalText).replace(/\n/g, "<br />")}</p>`;
    const resolvedHtml = wrapBrandedEmail({
      appUrl,
      title: opts.subject,
      bodyHtml,
      ctaUrl: opts.ctaUrl,
      ctaLabel: opts.ctaLabel,
      accent: opts.event === "approved" ? "success" : opts.event === "rejected" ? "warn" : "brand",
    });
    try {
      await sendNotificationEmail({
        to: recipient,
        subject: opts.subject,
        text: finalText,
        html: resolvedHtml,
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

  console.log("sendFlowNotification timing", {
    formSlug: opts.formSlug,
    event: opts.event,
    recipients: recipients.length,
    elapsedMs: Date.now() - startedAt,
  });

  return true;
}
