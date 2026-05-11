"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { writeAuditLog } from "@/lib/audit";
import { sendNotificationEmail } from "@/lib/notifications/email";
import { NotificationFlow } from "@/models/NotificationFlow";
import { NotificationDeliveryLog } from "@/models/NotificationDeliveryLog";
import { Approver } from "@/models/Approver";

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

function isValidEmail(input: string) {
  if (!input || input.length > 254) return false;
  // Practical validation for admin input; strict RFC parsing is unnecessary here.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

const NOTIFICATIONS_PATH = "/admin/notifications";

export async function sendNotificationTestEmail(formData: FormData) {
  const { email: adminEmail } = await requireAdmin();
  const rawInput = s(formData, "testEmail").toLowerCase();
  const targetEmail = rawInput || adminEmail;
  const sentAt = new Date().toISOString();
  const appEnv = process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown";

  if (!isValidEmail(targetEmail)) {
    await setFlashToast({
      tone: "error",
      message: "Invalid test email address. Please enter a valid email format (example@company.com).",
    });
    redirect(NOTIFICATIONS_PATH);
  }

  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM) {
      throw new Error("Missing SMTP setup. Please set SMTP_USER, SMTP_PASS, and SMTP_FROM in environment variables.");
    }

    await sendNotificationEmail({
      to: targetEmail,
      subject: "Vienovo Forms SMTP Test - Sample Notification",
      text:
        `Hello,\n\n` +
        `This is a SAMPLE SMTP test message from Vienovo Forms.\n` +
        `If you received this, the SMTP configuration is working correctly.\n\n` +
        `Sample content preview:\n` +
        `- Request Type: Travel Booking\n` +
        `- Reference No: TB-20260505-0001\n` +
        `- Status: Pending Approval\n\n` +
        `Verification details:\n` +
        `- Sent At (UTC): ${sentAt}\n` +
        `- Target Email: ${targetEmail}\n` +
        `- Environment: ${appEnv}\n\n` +
        `This is only a test message. No action is required.\n\n` +
        `SMTP host: ${process.env.SMTP_HOST || "smtp.office365.com"}\n` +
        `From: ${process.env.SMTP_FROM || "(missing SMTP_FROM)"}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <h2 style="margin: 0 0 12px;">Vienovo Forms SMTP Test - Sample Notification</h2>
          <p style="margin: 0 0 12px;">Hello,</p>
          <p style="margin: 0 0 12px;">This is a <strong>sample SMTP test message</strong> from Vienovo Forms.</p>
          <p style="margin: 0 0 12px;">If you received this, your SMTP configuration is working correctly.</p>
          <div style="padding: 12px; border: 1px solid #bfdbfe; border-radius: 10px; background: #eff6ff; margin: 0 0 12px;">
            <p style="margin: 0 0 6px;"><strong>Sample content preview:</strong></p>
            <p style="margin: 0;">Request Type: Travel Booking</p>
            <p style="margin: 0;">Reference No: TB-20260505-0001</p>
            <p style="margin: 0;">Status: Pending Approval</p>
          </div>
          <div style="padding: 12px; border: 1px solid #d1d5db; border-radius: 10px; background: #f9fafb; margin: 0 0 12px;">
            <p style="margin: 0 0 6px;"><strong>Verification details:</strong></p>
            <p style="margin: 0;">Sent At (UTC): ${sentAt}</p>
            <p style="margin: 0;">Target Email: ${targetEmail}</p>
            <p style="margin: 0;">Environment: ${appEnv}</p>
          </div>
          <p style="margin: 0 0 12px;">This is only a test message. No action is required.</p>
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
    await writeAuditLog({
      actorEmail: adminEmail,
      action: "send_smtp_test_email",
      targetType: "notification",
      targetId: targetEmail,
      details: { sentAt, appEnv },
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
  const { email } = await requireAdmin();
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
  await writeAuditLog({
    actorEmail: email,
    action: "save_notification_flow",
    targetType: "notification-flow",
    targetId: formSlug,
    details: { formName },
  });
  redirect(NOTIFICATIONS_PATH);
}

export async function resetNotificationFlow(formData: FormData) {
  const { email } = await requireAdmin();
  await connectMongo();

  const formSlug = s(formData, "formSlug");
  const formName = s(formData, "formName");
  if (!formSlug) redirect(NOTIFICATIONS_PATH);

  await NotificationFlow.deleteOne({ formSlug });
  await setFlashToast({
    tone: "success",
    message: `${formName || formSlug} notification flow reset to defaults.`,
  });
  await writeAuditLog({
    actorEmail: email,
    action: "reset_notification_flow",
    targetType: "notification-flow",
    targetId: formSlug,
    details: { formName },
  });
  redirect(NOTIFICATIONS_PATH);
}

export async function enableEmployeeInformationDefaults() {
  const { email } = await requireAdmin();
  await connectMongo();
  const hrRecipients = await Approver.find({ isActive: true, roles: "hr", email: { $ne: "" } })
    .select({ email: 1 })
    .lean();
  const recipients = Array.from(new Set(hrRecipients.map((item) => String(item.email || "").toLowerCase()).filter(Boolean)));
  await NotificationFlow.updateOne(
    { formSlug: "employee-information" },
    {
      $set: {
        formSlug: "employee-information",
        formName: "Employee Information",
        isActive: true,
        notifyOnSubmit: true,
        notifyNextApprover: false,
        notifySubmitterOnApproved: false,
        notifySubmitterOnRejected: false,
        extraRecipients: recipients,
        notes: "Auto-configured defaults: submitter + HR recipients on submit.",
      },
    },
    { upsert: true }
  );
  await writeAuditLog({
    actorEmail: email,
    action: "enable_employee_information_notification_defaults",
    targetType: "notification-flow",
    targetId: "employee-information",
    details: { hrRecipientCount: recipients.length },
  });
  await setFlashToast({ tone: "success", message: `Employee Information defaults enabled (${recipients.length} HR recipients).` });
  redirect(NOTIFICATIONS_PATH);
}

export async function resendFailedNotification(formData: FormData) {
  const { email: adminEmail } = await requireAdmin();
  const id = s(formData, "id");
  await connectMongo();

  const log = id
    ? await NotificationDeliveryLog.findOne({ _id: id, status: "failed", replayable: true }).lean()
    : null;
  if (!log) {
    await setFlashToast({
      tone: "error",
      message: "That failed notification is no longer available for resend.",
    });
    redirect(NOTIFICATIONS_PATH);
  }

  try {
    await sendNotificationEmail({
      to: log.recipient,
      subject: log.subject,
      text: log.text || "",
      html: log.html || "",
    });

    await NotificationDeliveryLog.create({
      formSlug: log.formSlug,
      formName: log.formName,
      event: log.event,
      recipient: log.recipient,
      subject: log.subject,
      status: "sent",
      text: log.text || "",
      html: log.html || "",
      replayable: true,
      retryOfLogId: log._id,
      resentAt: new Date(),
      resentByEmail: adminEmail,
    });

    await NotificationDeliveryLog.updateOne(
      { _id: log._id },
      {
        $set: {
          resentAt: new Date(),
          resentByEmail: adminEmail,
        },
      },
    );

    await writeAuditLog({
      actorEmail: adminEmail,
      action: "resend_failed_notification",
      targetType: "notification-delivery",
      targetId: String(log._id),
      details: {
        recipient: log.recipient,
        subject: log.subject,
        formSlug: log.formSlug,
      },
    });
    await setFlashToast({ tone: "success", message: `Notification resent to ${log.recipient}.` });
  } catch (error) {
    await setFlashToast({
      tone: "error",
      message:
        error instanceof Error && error.message.trim()
          ? `Resend failed: ${error.message.trim()}`
          : "Resend failed.",
      persistent: true,
    });
  }

  redirect(NOTIFICATIONS_PATH);
}
