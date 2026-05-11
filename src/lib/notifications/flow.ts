import { connectMongo } from "@/lib/db/mongo";
import { getAllFormDefinitionsForAdmin } from "@/lib/form-definitions";
import { NotificationFlow } from "@/models/NotificationFlow";
import { Approver } from "@/models/Approver";
import { NotificationDeliveryLog } from "@/models/NotificationDeliveryLog";
import { sendNotificationEmail } from "@/lib/notifications/email";

export type NotificationEvent = "submitted" | "resubmitted" | "next-approver" | "approved" | "rejected" | "returned";
export type NotificationDetail = {
  label: string;
  value: string;
};

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
  if (event === "rejected" || event === "returned") return flow.notifySubmitterOnRejected;
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

function messageTextToHtml(text: string) {
  const lines = String(text || "").split("\n");
  const html: string[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    html.push(
      `<ul style="margin:8px 0 14px 18px;padding:0;color:#334155;">${listBuffer.join("")}</ul>`,
    );
    listBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (line.startsWith("- ")) {
      listBuffer.push(`<li style="margin:4px 0;">${escapeHtml(line.slice(2))}</li>`);
      continue;
    }
    flushList();
    html.push(`<p style="margin:0 0 12px;">${escapeHtml(line)}</p>`);
  }
  flushList();
  return html.join("");
}

function looksLikeFullHtmlDocument(html: string) {
  const v = String(html || "").toLowerCase();
  return v.includes("<html") || v.includes("<body") || v.includes("<!doctype");
}

function notificationDetailsToHtml(details: NotificationDetail[]) {
  if (!details.length) return "";
  return `
    <div style="margin:18px 0 0;border:1px solid #dbe4f0;border-radius:14px;overflow:hidden;background:#fbfdff;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        ${details
          .map(
            (detail, index) => `
              <tr>
                <td style="width:34%;padding:12px 14px;border-bottom:${index === details.length - 1 ? "0" : "1px solid #e2e8f0"};background:#f8fafc;color:#64748b;font-size:12px;font-weight:700;letter-spacing:.02em;vertical-align:top;">
                  ${escapeHtml(detail.label)}
                </td>
                <td style="padding:12px 14px;border-bottom:${index === details.length - 1 ? "0" : "1px solid #e2e8f0"};color:#0f172a;font-size:14px;line-height:1.55;vertical-align:top;">
                  ${escapeHtml(detail.value)}
                </td>
              </tr>`,
          )
          .join("")}
      </table>
    </div>
  `;
}

function buildNotificationBodyHtml(opts: {
  title: string;
  summary?: string;
  bodyHtml?: string;
  details?: NotificationDetail[];
  ctaUrl?: string;
  ctaLabel?: string;
  approveUrl?: string;
  rejectUrl?: string;
  viewAllUrl?: string;
  accent?: "brand" | "success" | "warn";
}) {
  const accentColor = opts.accent === "success" ? "#0f5f35" : opts.accent === "warn" ? "#b45309" : "#1e293b";
  const accentBg = opts.accent === "success" ? "#ecfdf3" : opts.accent === "warn" ? "#fff7ed" : "#eef4ff";
  const accentText = opts.accent === "success" ? "#166534" : opts.accent === "warn" ? "#b45309" : "#1d4ed8";
  const primaryCtaHtml = opts.ctaUrl
    ? `<a href="${opts.ctaUrl}" style="display:inline-block;padding:11px 16px;border-radius:10px;background:${accentColor};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">
         ${escapeHtml(opts.ctaLabel || "Open")}
       </a>`
    : "";
  const approveHtml = opts.approveUrl
    ? `<a href="${opts.approveUrl}" style="display:inline-block;padding:11px 16px;border-radius:10px;background:#0f5f35;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">
         Approve
       </a>`
    : "";
  const rejectHtml = opts.rejectUrl
    ? `<a href="${opts.rejectUrl}" style="display:inline-block;padding:11px 16px;border-radius:10px;background:#b91c1c;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">
         Reject
       </a>`
    : "";
  const viewAllHtml = opts.viewAllUrl
    ? `<a href="${opts.viewAllUrl}" style="display:inline-block;padding:11px 16px;border-radius:10px;border:1px solid #cbd5e1;background:#ffffff;color:#0f172a;text-decoration:none;font-weight:700;font-size:14px;">
         View all approval views
       </a>`
    : "";
  const ctaHtml = [approveHtml, rejectHtml, viewAllHtml, primaryCtaHtml].filter(Boolean).length
    ? `<p style="margin:20px 0 0;display:flex;flex-wrap:wrap;gap:8px;">
         ${approveHtml}
         ${rejectHtml}
         ${viewAllHtml}
         ${primaryCtaHtml}
       </p>`
    : "";

  return `
    <div style="margin:0;">
      ${
        opts.summary
          ? `<div style="margin:0 0 18px;padding:14px 16px;border-radius:14px;background:${accentBg};color:${accentText};font-size:14px;line-height:1.65;">
               ${escapeHtml(opts.summary)}
             </div>`
          : ""
      }
      <div style="font-size:14px;line-height:1.7;color:#334155;">
        ${opts.bodyHtml || ""}
      </div>
      ${opts.details?.length ? notificationDetailsToHtml(opts.details) : ""}
      ${ctaHtml}
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
  summary?: string;
  details?: NotificationDetail[];
  ctaUrl?: string;
  ctaLabel?: string;
  approveUrl?: string;
  rejectUrl?: string;
  viewAllUrl?: string;
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
    const detailsText = opts.details?.length
      ? `${opts.details.map((detail) => `${detail.label}: ${detail.value}`).join("\n")}\n`
      : "";
    const composedText = opts.summary
      ? `${opts.summary}\n\n${detailsText}${baseText}`.trim()
      : `${detailsText}${baseText}`.trim();
    const finalText = prependGreeting({
      body: composedText,
      roleHint,
      lastName,
      formName: opts.formName,
      formSlug: opts.formSlug,
    });
    const resolvedHtml = opts.html && looksLikeFullHtmlDocument(opts.html)
      ? opts.html
      : buildNotificationBodyHtml({
          title: opts.subject,
          summary: opts.summary,
          bodyHtml: opts.html || (!opts.details?.length ? messageTextToHtml(baseText) : ""),
          details: opts.details,
          ctaUrl: opts.ctaUrl,
          ctaLabel: opts.ctaLabel,
          approveUrl: opts.approveUrl,
          rejectUrl: opts.rejectUrl,
          viewAllUrl: opts.viewAllUrl,
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
