"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { sendNotificationEmail } from "@/lib/notifications/email";
import { NotificationFlow } from "@/models/NotificationFlow";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function bool(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function parseEmails(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[\n,;]+/g)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

const NOTIFICATIONS_PATH = "/admin/notifications";

export async function sendNotificationTestEmail(formData: FormData) {
  const { email: adminEmail } = await requireAdmin();
  const targetEmail = s(formData, "testEmail").toLowerCase() || adminEmail;

  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM) {
      throw new Error("Missing SMTP setup. Please set SMTP_USER, SMTP_PASS, and SMTP_FROM in environment variables.");
    }

    await sendNotificationEmail({
      to: targetEmail,
      subject: "Vienovo Forms SMTP test",
      text:
        `This is a test email from Vienovo Forms.\n\n` +
        `If you received this, the SMTP settings on the current deployment are working.\n\n` +
        `SMTP host: ${process.env.SMTP_HOST || "smtp.office365.com"}\n` +
        `From: ${process.env.SMTP_FROM || "(missing SMTP_FROM)"}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <h2 style="margin: 0 0 12px;">Vienovo Forms SMTP test</h2>
          <p style="margin: 0 0 12px;">This is a test email from the admin notification flow page.</p>
          <p style="margin: 0 0 12px;">If you received this, the SMTP settings on the current deployment are working.</p>
          <div style="padding: 12px; border: 1px solid #d1d5db; border-radius: 10px; background: #f9fafb;">
            <p style="margin: 0 0 6px;"><strong>SMTP host:</strong> ${process.env.SMTP_HOST || "smtp.office365.com"}</p>
            <p style="margin: 0;"><strong>From:</strong> ${process.env.SMTP_FROM || "(missing SMTP_FROM)"}</p>
          </div>
        </div>
      `,
    });

    await setFlashToast({
      tone: "success",
      message: `Test email sent to ${targetEmail}.`,
    });
  } catch (error) {
    console.error("sendNotificationTestEmail failed:", error);
    await setFlashToast({
      tone: "error",
      message:
        error instanceof Error && error.message.trim()
          ? `SMTP test failed: ${error.message.trim()}`
          : "SMTP test failed.",
    });
  }

  redirect(NOTIFICATIONS_PATH);
}

export async function saveNotificationFlow(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const formSlug = s(formData, "formSlug");
  const formName = s(formData, "formName");
  if (!formSlug || !formName) {
    await setFlashToast({ tone: "error", message: "Notification flow is missing its form identity." });
    redirect(NOTIFICATIONS_PATH);
  }

  await NotificationFlow.updateOne(
    { formSlug },
    {
      $set: {
        formSlug,
        formName,
        isActive: bool(formData, "isActive"),
        notifyOnSubmit: bool(formData, "notifyOnSubmit"),
        notifyNextApprover: bool(formData, "notifyNextApprover"),
        notifySubmitterOnApproved: bool(formData, "notifySubmitterOnApproved"),
        notifySubmitterOnRejected: bool(formData, "notifySubmitterOnRejected"),
        extraRecipients: parseEmails(s(formData, "extraRecipients")),
        notes: s(formData, "notes"),
      },
    },
    { upsert: true }
  );

  await setFlashToast({ tone: "success", message: `Notification flow saved for ${formName}.` });
  redirect(NOTIFICATIONS_PATH);
}

export async function resetNotificationFlow(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const formSlug = s(formData, "formSlug");
  const formName = s(formData, "formName");
  if (!formSlug) redirect(NOTIFICATIONS_PATH);

  await NotificationFlow.deleteOne({ formSlug });
  await setFlashToast({
    tone: "success",
    message: `${formName || formSlug} notification flow reset to defaults.`,
  });
  redirect(NOTIFICATIONS_PATH);
}
