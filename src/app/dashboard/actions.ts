"use server";

import { revalidatePath } from "next/cache";
import { isAdminUser } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { safeAuth } from "@/lib/safe-auth";
import { RequestModel } from "@/models/Request";

const PAGE_SIZE = 5;

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export type RequestRowData = {
  _id: string;
  referenceNo: string;
  status: string;
  createdAt: string;
  formType: string;
  formName: string;
  formSlug: string;
  currentRole: string;
  currentActorName: string;
  currentActorEmail: string;
};

type FetchResult = {
  items: RequestRowData[];
  total: number;
  page: number;
  totalPages: number;
};

function formatRow(doc: Record<string, unknown>): RequestRowData {
  return {
    _id: String(doc._id),
    referenceNo: String(doc.referenceNo ?? ""),
    status: String(doc.status ?? ""),
    createdAt: String(doc.createdAt ?? ""),
    formType: String(doc.formType ?? ""),
    formName: String(doc.formName ?? ""),
    formSlug: String(doc.formSlug ?? ""),
    currentRole: String(doc.currentRole ?? ""),
    currentActorName: String(doc.currentActorName ?? ""),
    currentActorEmail: String(doc.currentActorEmail ?? ""),
  };
}

const SELECT_FIELDS = {
  _id: 1,
  referenceNo: 1,
  status: 1,
  createdAt: 1,
  formType: 1,
  formName: 1,
  formSlug: 1,
  currentRole: 1,
  currentActorName: 1,
  currentActorEmail: 1,
};

export async function fetchMyRequests(
  userEmail: string,
  statusFilter: string,
  query: string,
  page: number,
): Promise<FetchResult> {
  await connectMongo();
  const filter: Record<string, unknown> = { "submittedBy.email": userEmail };
  if (["pending", "approved", "rejected", "returned", "submitted"].includes(statusFilter)) {
    filter.status = statusFilter;
  }
  if (query) {
    filter.$or = [
      { referenceNo: { $regex: query, $options: "i" } },
      { formName: { $regex: query, $options: "i" } },
      { formSlug: { $regex: query, $options: "i" } },
    ];
  }
  const [items, total] = await Promise.all([
    RequestModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .select(SELECT_FIELDS)
      .lean(),
    RequestModel.countDocuments(filter),
  ]);
  return {
    items: items.map((d: Record<string, unknown>) => formatRow(d)),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function fetchPendingApprovals(
  userEmail: string,
  query: string,
  page: number,
): Promise<FetchResult> {
  await connectMongo();
  const pendingOwnershipFilter = {
    $or: [
      { currentActorEmail: userEmail },
      {
        $expr: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: "$approvalChain",
                  as: "step",
                  cond: {
                    $and: [
                      { $eq: ["$$step.approverEmail", userEmail] },
                      { $eq: ["$$step.step", "$currentStep"] },
                      { $eq: ["$$step.status", "pending"] },
                    ],
                  },
                },
              },
            },
            0,
          ],
        },
      },
      { approvalChain: { $elemMatch: { approverEmail: userEmail, status: "pending" } } },
    ],
  };
  const requesterApprovalTrackingFilter = {
    "submittedBy.email": userEmail,
    formSlug: { $ne: "employee-information" },
    status: { $in: ["pending", "approved", "rejected"] },
  };
  const filter: Record<string, unknown> = {
    $or: [
      {
        status: { $in: ["pending", "submitted"] },
        "approvalChain.0": { $exists: true },
        ...pendingOwnershipFilter,
      },
      requesterApprovalTrackingFilter,
    ],
  };
  if (query) {
    filter.$and = [
      {
        $or: [
          {
            status: { $in: ["pending", "submitted"] },
            "approvalChain.0": { $exists: true },
            ...pendingOwnershipFilter,
          },
          requesterApprovalTrackingFilter,
        ],
      },
      {
        $or: [
          { referenceNo: { $regex: query, $options: "i" } },
          { formName: { $regex: query, $options: "i" } },
          { formSlug: { $regex: query, $options: "i" } },
        ],
      },
    ];
  }
  const largePageSize = 50;
  const [items, total] = await Promise.all([
    RequestModel.find(filter)
      .sort({ status: 1, createdAt: -1, _id: -1 })
      .skip((page - 1) * largePageSize)
      .limit(largePageSize)
      .select(SELECT_FIELDS)
      .lean(),
    RequestModel.countDocuments(filter),
  ]);
  return {
    items: items.map((d: Record<string, unknown>) => formatRow(d)),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / largePageSize)),
  };
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
  const isAdmin = await isAdminUser(email);
  if (!isOwner && !isAdmin) {
    throw new Error("You can only delete your own requests.");
  }

  await RequestModel.deleteOne({ referenceNo });
  await setFlashToast({ tone: "success", message: `Request ${referenceNo} was deleted.` });

  revalidatePath("/dashboard");
  revalidatePath(`/requests/${referenceNo}`);
}
