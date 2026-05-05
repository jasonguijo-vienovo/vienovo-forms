"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { configuredAdminEmails, requireAdmin } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { APP_USER_ROLES, User, type AppUserRole } from "@/models/User";

const USER_ROLES_PATH = "/admin/user-roles";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normalizeEmail(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

function validateRole(role: string): role is AppUserRole {
  return (APP_USER_ROLES as readonly string[]).includes(role);
}

async function saveRole({
  email,
  name,
  role,
}: {
  email: string;
  name: string;
  role: AppUserRole;
}) {
  await User.updateOne(
    { email },
    {
      $set: {
        email,
        name,
        role,
      },
      $setOnInsert: {
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export async function saveUserRole(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const email = normalizeEmail(s(formData, "email"));
  const name = s(formData, "name");
  const role = s(formData, "role");

  if (!email || !email.endsWith("@vienovo.ph")) {
    await setFlashToast({
      tone: "error",
      message: "Use a valid @vienovo.ph email address.",
    });
    redirect(USER_ROLES_PATH);
  }

  if (!validateRole(role)) {
    await setFlashToast({ tone: "error", message: "Invalid role selected." });
    redirect(USER_ROLES_PATH);
  }

  await saveRole({ email, name, role });
  await setFlashToast({
    tone: "success",
    message: `${email} is now set as ${role}.`,
  });

  revalidatePath(USER_ROLES_PATH);
  redirect(USER_ROLES_PATH);
}

export async function promoteUserToAdmin(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const email = normalizeEmail(s(formData, "email"));
  const name = s(formData, "name");
  if (!email) redirect(USER_ROLES_PATH);

  await saveRole({ email, name, role: "admin" });
  await setFlashToast({
    tone: "success",
    message: `${email} was promoted to admin.`,
  });

  revalidatePath(USER_ROLES_PATH);
  redirect(USER_ROLES_PATH);
}

export async function demoteUserToRequester(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const email = normalizeEmail(s(formData, "email"));
  if (!email) redirect(USER_ROLES_PATH);

  if (configuredAdminEmails().has(email)) {
    await setFlashToast({
      tone: "error",
      message: `${email} is still forced as admin by ADMIN_EMAILS.`,
    });
    redirect(USER_ROLES_PATH);
  }

  await saveRole({
    email,
    name: s(formData, "name"),
    role: "user",
  });
  await setFlashToast({
    tone: "success",
    message: `${email} was demoted to requester.`,
  });

  revalidatePath(USER_ROLES_PATH);
  redirect(USER_ROLES_PATH);
}
