import nodemailer from "nodemailer";

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getTransport() {
  const user = requiredEnv("SMTP_USER");
  const pass = requiredEnv("SMTP_PASS");

  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = Number(process.env.SMTP_PORT || "587");
  const secure = String(process.env.SMTP_SECURE || "0") === "1";

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(text?: string) {
  if (!text) return "";
  return escapeHtml(text).replace(/\n/g, "<br />");
}

function looksLikeFullHtmlDocument(html?: string) {
  const value = String(html ?? "").toLowerCase();
  return value.includes("<html") || value.includes("<body") || value.includes("<!doctype");
}

function withVienovoTemplate(opts: { subject: string; html?: string; text?: string }) {
  if (looksLikeFullHtmlDocument(opts.html)) return String(opts.html ?? "");

  const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
  const logoSrc = appUrl ? `${appUrl}/brand/vienovo-feed-for-life.png` : "";
  const contentHtml = opts.html?.trim() || textToHtml(opts.text) || "<p>No message content provided.</p>";

  return `
  <div style="margin:0;padding:28px;background:linear-gradient(180deg,#f4f7f5 0%,#edf3f8 100%);font-family:Segoe UI,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbe5de;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
      <tr>
        <td style="padding:18px 24px;background:linear-gradient(90deg,#0f5f35 0%,#1f7a45 100%);">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="vertical-align:middle;">
                ${
                  logoSrc
                    ? `<img src="${logoSrc}" alt="Vienovo" style="display:block;height:34px;width:auto;" />`
                    : `<div style="color:#fff;font-size:18px;font-weight:700;">Vienovo</div>`
                }
              </td>
              <td style="text-align:right;vertical-align:middle;color:rgba(255,255,255,0.88);font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;">
                Forms Notification
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 24px 22px;">
          <h2 style="margin:0 0 14px;color:#0f172a;font-size:24px;line-height:1.28;font-weight:800;">${escapeHtml(opts.subject)}</h2>
          <div style="height:1px;background:#e2e8f0;margin:0 0 18px;"></div>
          <div style="font-size:14px;line-height:1.8;color:#334155;">
            ${contentHtml}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:12px;">
          Vienovo Forms Notification • This is an automated email.
        </td>
      </tr>
    </table>
  </div>`;
}

export async function sendNotificationEmail(opts: {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}) {
  const from = requiredEnv("SMTP_FROM");
  const transporter = getTransport();
  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: withVienovoTemplate({ subject: opts.subject, html: opts.html, text: opts.text }),
  });
}
