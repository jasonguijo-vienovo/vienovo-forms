import { connectMongo } from "@/lib/db/mongo";
import { getCurrentApprovalStep, OPEN_REQUEST_STATUSES } from "@/lib/request-queue";
import { RequestModel } from "@/models/Request";
import {
  buildAdminRequestsFilter,
  buildCursorFilter,
  buildSortObject,
  decodeCursor,
  encodeCursor,
  getDbSort,
  invertDirection,
  parseAdminRequestsQuery,
} from "./query";
import { RequestsClient, type RequestQueueRow } from "./RequestsClient";

type SearchParamsInput = Record<string, string | string[] | undefined>;
type RequestVolumeByForm = {
  formKey: string;
  formLabel: string;
  total: number;
  open: number;
  returned: number;
};

type RequestBottleneck = {
  laneKey: string;
  label: string;
  role: string;
  queueBucket: string;
  count: number;
  oldestCreatedAt: string;
  newestUpdatedAt: string;
};

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsInput>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};

  await connectMongo();

  const query = parseAdminRequestsQuery(resolvedSearchParams);
  const filter = buildAdminRequestsFilter(query);
  const summaryFilter = buildAdminRequestsFilter(query, { excludeStatusLike: true });
  const dbSort = getDbSort(query);

  const afterCursor = decodeCursor(query.after);
  const beforeCursor = afterCursor ? null : decodeCursor(query.before);
  const cursorFilter = afterCursor
    ? buildCursorFilter({
        field: dbSort.field,
        direction: dbSort.direction,
        cursor: afterCursor,
        relation: "after",
      })
    : beforeCursor
      ? buildCursorFilter({
          field: dbSort.field,
          direction: dbSort.direction,
          cursor: beforeCursor,
          relation: "before",
        })
      : null;

  const matchFilter =
    cursorFilter && Object.keys(filter).length > 0
      ? { $and: [filter, cursorFilter] }
      : cursorFilter
        ? cursorFilter
        : filter;

  const queryLimit = query.limit + 1;
  const sortDirection = beforeCursor ? invertDirection(dbSort.direction) : dbSort.direction;
  const sortObject = buildSortObject(dbSort.field, sortDirection);

  const [rawRows, filteredCount, summaryCounts, formOptions, assigneeOptions, volumeByForm, bottlenecks] =
    await Promise.all([
    RequestModel.find(matchFilter)
      .sort(sortObject as any)
      .limit(queryLimit)
      .select({
        referenceNo: 1,
        formType: 1,
        formSlug: 1,
        formName: 1,
        submittedBy: 1,
        status: 1,
        approvalChain: 1,
        currentStep: 1,
        createdAt: 1,
        updatedAt: 1,
        currentActorEmail: 1,
        currentActorName: 1,
        currentRole: 1,
        queueBucket: 1,
        lastActionAt: 1,
        lastActionBy: 1,
        history: { $slice: -4 },
      })
      .lean(),
    RequestModel.countDocuments(filter),
    RequestModel.aggregate([
      { $match: summaryFilter },
      {
        $group: {
          _id: null,
          totalOpen: {
            $sum: {
              $cond: [{ $in: ["$status", [...OPEN_REQUEST_STATUSES]] }, 1, 0],
            },
          },
          pendingApproval: {
            $sum: {
              $cond: [{ $eq: ["$queueBucket", "pending-approval"] }, 1, 0],
            },
          },
          needsProcessor: {
            $sum: {
              $cond: [{ $eq: ["$queueBucket", "needs-processor"] }, 1, 0],
            },
          },
          returned: {
            $sum: {
              $cond: [{ $eq: ["$status", "returned"] }, 1, 0],
            },
          },
          rejected: {
            $sum: {
              $cond: [{ $eq: ["$status", "rejected"] }, 1, 0],
            },
          },
          submitted: {
            $sum: {
              $cond: [{ $eq: ["$status", "submitted"] }, 1, 0],
            },
          },
        },
      },
    ]),
    RequestModel.aggregate([
      {
        $group: {
          _id: "$formSlug",
          formName: { $first: "$formName" },
          formType: { $first: "$formType" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    RequestModel.aggregate([
      { $match: { currentActorEmail: { $ne: "" } } },
      {
        $group: {
          _id: "$currentActorEmail",
          name: { $first: "$currentActorName" },
        },
      },
      { $sort: { name: 1, _id: 1 } },
    ]),
    RequestModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { formSlug: "$formSlug", formType: "$formType" },
          formName: { $first: "$formName" },
          total: { $sum: 1 },
          open: {
            $sum: {
              $cond: [{ $in: ["$status", [...OPEN_REQUEST_STATUSES]] }, 1, 0],
            },
          },
          returned: {
            $sum: {
              $cond: [{ $eq: ["$status", "returned"] }, 1, 0],
            },
          },
        },
      },
      { $sort: { total: -1, "_id.formSlug": 1, "_id.formType": 1 } },
      { $limit: 6 },
    ]),
    RequestModel.aggregate([
      {
        $match: {
          $and: [filter, { status: { $in: [...OPEN_REQUEST_STATUSES] } }],
        },
      },
      {
        $group: {
          _id: {
            role: "$currentRole",
            actorEmail: "$currentActorEmail",
            actorName: "$currentActorName",
            queueBucket: "$queueBucket",
          },
          count: { $sum: 1 },
          oldestCreatedAt: { $min: "$createdAt" },
          newestUpdatedAt: { $max: "$updatedAt" },
        },
      },
      { $sort: { count: -1, oldestCreatedAt: 1 } },
      { $limit: 6 },
    ]),
  ]);

  const hasOverflow = rawRows.length > query.limit;
  const pageRows = hasOverflow ? rawRows.slice(0, query.limit) : rawRows;
  const displayRows = beforeCursor ? [...pageRows].reverse() : pageRows;
  const rows = displayRows.map((request) => toQueueRow(request as any));

  const firstRow = rows[0] ?? null;
  const lastRow = rows.at(-1) ?? null;

  const [hasPrevious, hasNext] = await Promise.all([
    firstRow
      ? RequestModel.exists({
          $and: [
            filter,
            buildCursorFilter({
              field: dbSort.field,
              direction: dbSort.direction as "asc" | "desc",
              cursor: {
                id: firstRow._id,
                value: new Date(firstRow[dbSort.field]),
              },
              relation: "before",
            }),
          ],
        }).then(Boolean)
      : Promise.resolve(false),
    lastRow
      ? RequestModel.exists({
          $and: [
            filter,
            buildCursorFilter({
              field: dbSort.field,
              direction: dbSort.direction as "asc" | "desc",
              cursor: {
                id: lastRow._id,
                value: new Date(lastRow[dbSort.field]),
              },
              relation: "after",
            }),
          ],
        }).then(Boolean)
      : Promise.resolve(false),
  ]);

  const summary = summaryCounts[0] ?? {
    totalOpen: 0,
    pendingApproval: 0,
    needsProcessor: 0,
    returned: 0,
    rejected: 0,
    submitted: 0,
  };

  return (
    <RequestsClient
      rows={rows}
      filters={query}
      filteredCount={filteredCount}
      summary={{
        totalOpen: Number(summary.totalOpen ?? 0),
        pendingApproval: Number(summary.pendingApproval ?? 0),
        needsProcessor: Number(summary.needsProcessor ?? 0),
        returned: Number(summary.returned ?? 0),
        rejected: Number(summary.rejected ?? 0),
        submitted: Number(summary.submitted ?? 0),
      }}
      analytics={{
        volumeByForm: volumeByForm.map((item: any) => toVolumeByForm(item)),
        bottlenecks: bottlenecks.map((item: any) => toBottleneck(item)),
      }}
      formOptions={formOptions.map((item) => ({
        value: String(item._id ?? item.formType ?? "").trim(),
        label: String(item.formName || item._id || item.formType || "Unknown form"),
      })).filter((item) => item.value)}
      assigneeOptions={assigneeOptions.map((item) => ({
        value: String(item._id ?? "").trim().toLowerCase(),
        label: String(item.name || item._id || "Unknown assignee"),
      })).filter((item) => item.value)}
      pageInfo={{
        hasPrevious,
        hasNext,
        previousCursor: firstRow ? encodeCursor(firstRow, dbSort.field) : "",
        nextCursor: lastRow ? encodeCursor(lastRow, dbSort.field) : "",
      }}
    />
  );
}

function toQueueRow(request: any): RequestQueueRow {
  const fallbackCurrent = getCurrentApprovalStep({
    approvalChain: request.approvalChain ?? [],
    currentStep: request.currentStep ?? 0,
  });

  const currentActorEmail = request.currentActorEmail || fallbackCurrent?.approverEmail || "";
  const currentActorName = request.currentActorName || fallbackCurrent?.approverName || "";
  const currentRole = request.currentRole || fallbackCurrent?.role || "";
  const currentStepNumber = Number(request.currentStep ?? 0);
  const totalSteps = Array.isArray(request.approvalChain) ? request.approvalChain.length : 0;

  return {
    _id: String(request._id),
    referenceNo: request.referenceNo,
    formType: request.formType,
    formSlug: request.formSlug,
    formName: request.formName,
    submittedBy: request.submittedBy ?? undefined,
    status: request.status,
    createdAt: toIso(request.createdAt),
    updatedAt: toIso(request.updatedAt),
    currentActorEmail,
    currentActorName,
    currentRole,
    currentStep: currentStepNumber,
    totalSteps,
    queueBucket: request.queueBucket || "unknown",
    lastActionAt: toIso(request.lastActionAt || request.updatedAt),
    lastActionBy: request.lastActionBy || request.submittedBy?.name || request.submittedBy?.email || "",
    approvalChain: Array.isArray(request.approvalChain)
      ? request.approvalChain.map((step: any) => ({
          step: Number(step.step ?? 0),
          role: String(step.role ?? ""),
          approverEmail: String(step.approverEmail ?? ""),
          approverName: String(step.approverName ?? ""),
          status: String(step.status ?? ""),
          actedAt: step.actedAt ? toIso(step.actedAt) : "",
          comment: String(step.comment ?? ""),
        }))
      : [],
    history: Array.isArray(request.history)
      ? [...request.history]
          .slice(-4)
          .reverse()
          .map((item: any) => ({
            at: item.at ? toIso(item.at) : "",
            byEmail: String(item.byEmail ?? ""),
            byName: String(item.byName ?? ""),
            action: String(item.action ?? ""),
          }))
      : [],
  };
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString();
}

function toVolumeByForm(item: any): RequestVolumeByForm {
  const slug = String(item?._id?.formSlug ?? "").trim();
  const formType = String(item?._id?.formType ?? "").trim();
  const formLabel = String(item?.formName || slug || formType || "Unknown form");

  return {
    formKey: slug || formType || formLabel.toLowerCase(),
    formLabel,
    total: Number(item?.total ?? 0),
    open: Number(item?.open ?? 0),
    returned: Number(item?.returned ?? 0),
  };
}

function toBottleneck(item: any): RequestBottleneck {
  const role = String(item?._id?.role ?? "").trim();
  const actorEmail = String(item?._id?.actorEmail ?? "").trim();
  const actorName = String(item?._id?.actorName ?? "").trim();
  const queueBucket = String(item?._id?.queueBucket ?? "").trim();
  const label = actorName || actorEmail || humanizeQueueLabel(queueBucket) || "Unassigned queue";

  return {
    laneKey: [role, actorEmail, queueBucket].filter(Boolean).join(":") || label,
    label,
    role,
    queueBucket,
    count: Number(item?.count ?? 0),
    oldestCreatedAt: toIso(item?.oldestCreatedAt),
    newestUpdatedAt: toIso(item?.newestUpdatedAt),
  };
}

function humanizeQueueLabel(value: string) {
  if (!value) return "";
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
