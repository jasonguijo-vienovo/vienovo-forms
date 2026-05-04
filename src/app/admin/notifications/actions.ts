"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
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
