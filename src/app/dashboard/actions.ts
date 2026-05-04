"use server";

import { revalidatePath } from "next/cache";
import { isAdminEmail } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { safeAuth } from "@/lib/safe-auth";
import { RequestModel } from "@/models/Request";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function deleteDashboardRequest(formData: FormData) {
  const session = await safeAuth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) throw new Error("Not signed in");

  const referenceNo = s(formData, "referenceNo");
  if (!referenceNo) return;

  await connectMongo();
  const doc = await RequestModel.findOne({ referenceNo }).lean();
  if (!doc) return;

  const isOwner = doc.submittedBy?.email?.toLowerCase() === email;
  const isAdmin = isAdminEmail(email);
  if (!isOwner && !isAdmin) {
    throw new Error("You can only delete your own requests.");
  }

  await RequestModel.deleteOne({ referenceNo });
  await setFlashToast({ tone: "success", message: `Request ${referenceNo} was deleted.` });

  revalidatePath("/dashboard");
  revalidatePath(`/requests/${referenceNo}`);
}
