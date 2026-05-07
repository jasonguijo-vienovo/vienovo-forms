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

function withVienovoTemplate(opts: { subject: string; html?: string; text?: string }) {
  const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
  const logoSrc = appUrl ? `${appUrl}/brand/vienovo-feed-for-life.png` : "";
  const contentHtml = opts.html?.trim() || textToHtml(opts.text) || "<p>No message content provided.</p>";

  return `
  <div style="margin:0;padding:24px;background:#f4f7f5;font-family:Segoe UI,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d8e3da;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="padding:18px 22px;background:linear-gradient(90deg,#0b6b36 0%,#15803d 100%);">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="vertical-align:middle;">
                ${logoSrc ? `<img src="${logoSrc}" alt="Vienovo" style="display:block;height:36px;width:auto;" />` : `<div style="color:#fff;font-size:18px;font-weight:700;">Vienovo</div>`}
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:22px;">
          <h2 style="margin:0 0 14px;color:#0f172a;font-size:20px;line-height:1.3;">${escapeHtml(opts.subject)}</h2>
          <div style="font-size:14px;line-height:1.7;color:#334155;">
            ${contentHtml}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 22px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:12px;">
          Vienovo Forms Notification
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

