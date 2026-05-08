import mongoose from "mongoose";
import { z } from "zod";
import { OPEN_REQUEST_STATUSES, type RequestQueueBucket } from "@/lib/request-queue";

const STATUS_VALUES = ["all", "pending", "submitted", "approved", "returned", "rejected"] as const;
const SORT_VALUES = ["createdAt", "updatedAt", "age"] as const;
const DIRECTION_VALUES = ["asc", "desc"] as const;
const SAVED_VIEW_VALUES = [
  "all-open",
  "pending-approval",
  "returned",
  "waiting-3-days",
  "travel-booking",
  "reimbursement",
  "needs-processor",
] as const;

const QuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  status: z.enum(STATUS_VALUES).optional().default("all"),
  form: z.string().trim().max(120).optional().default(""),
  assignee: z.string().trim().max(160).optional().default(""),
  from: z.string().trim().optional().default(""),
  to: z.string().trim().optional().default(""),
  limit: z.coerce.number().int().optional().default(25),
  sort: z.enum(SORT_VALUES).optional().default("createdAt"),
  direction: z.enum(DIRECTION_VALUES).optional().default("desc"),
  after: z.string().trim().optional().default(""),
  before: z.string().trim().optional().default(""),
  view: z.enum(SAVED_VIEW_VALUES).optional(),
});

export type AdminRequestStatusFilter = (typeof STATUS_VALUES)[number];
export type AdminRequestSortKey = (typeof SORT_VALUES)[number];
export type AdminRequestDirection = (typeof DIRECTION_VALUES)[number];
export type AdminRequestSavedView = (typeof SAVED_VIEW_VALUES)[number];

export type ParsedAdminRequestsQuery = {
  q: string;
  status: AdminRequestStatusFilter;
  form: string;
  assignee: string;
  from: string;
  to: string;
  limit: number;
  sort: AdminRequestSortKey;
  direction: AdminRequestDirection;
  after: string;
  before: string;
  view?: AdminRequestSavedView;
  queueBucket?: RequestQueueBucket;
  openOnly: boolean;
  olderThanDays?: number;
};

export type CursorPayload = {
  id: string;
  value: Date;
};

export function parseAdminRequestsQuery(raw: Record<string, string | string[] | undefined>) {
  const input = QuerySchema.parse({
    q: first(raw.q),
    status: first(raw.status),
    form: first(raw.form),
    assignee: first(raw.assignee),
    from: first(raw.from),
    to: first(raw.to),
    limit: first(raw.limit),
    sort: first(raw.sort),
    direction: first(raw.direction),
    after: first(raw.after),
    before: first(raw.before),
    view: first(raw.view),
  });

  const parsed: ParsedAdminRequestsQuery = {
    q: input.q,
    status: input.status,
    form: input.form.toLowerCase(),
    assignee: input.assignee.toLowerCase(),
    from: input.from,
    to: input.to,
    limit: clampLimit(input.limit),
    sort: input.sort,
    direction: input.direction,
    after: input.after,
    before: input.before,
    view: input.view,
    openOnly: false,
  };

  applySavedViewDefaults(parsed);

  if (parsed.status !== "all") {
    parsed.openOnly = false;
    parsed.queueBucket = undefined;
  }

  if (parsed.after && parsed.before) {
    parsed.before = "";
  }

  return parsed;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function clampLimit(value: number) {
  if (value <= 25) return 25;
  if (value <= 50) return 50;
  return 100;
}

function applySavedViewDefaults(parsed: ParsedAdminRequestsQuery) {
  switch (parsed.view) {
    case "all-open":
      if (parsed.status === "all") parsed.openOnly = true;
      break;
    case "pending-approval":
      if (parsed.status === "all") parsed.queueBucket = "pending-approval";
      break;
    case "returned":
      if (parsed.status === "all") parsed.status = "returned";
      break;
    case "waiting-3-days":
      parsed.olderThanDays = 3;
      if (parsed.status === "all") parsed.openOnly = true;
      break;
    case "travel-booking":
      if (!parsed.form) parsed.form = "travel-booking";
      break;
    case "reimbursement":
      if (!parsed.form) parsed.form = "reimbursement";
      break;
    case "needs-processor":
      if (parsed.status === "all") parsed.queueBucket = "needs-processor";
      break;
    default:
      break;
  }
}

export function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildAdminRequestsFilter(
  query: ParsedAdminRequestsQuery,
  opts: { excludeStatusLike?: boolean } = {},
) {
  const clauses: Record<string, unknown>[] = [];

  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), "i");
    clauses.push({
      $or: [
        { referenceNo: regex },
        { formName: regex },
        { formSlug: regex },
        { formType: regex },
        { "submittedBy.name": regex },
        { "submittedBy.email": regex },
      ],
    });
  }

  if (query.form) {
    clauses.push({
      $or: [{ formSlug: query.form }, { formType: query.form }],
    });
  }

  if (query.assignee) {
    clauses.push({ currentActorEmail: query.assignee });
  }

  const createdAtFilter: Record<string, Date> = {};
  if (query.from) {
    const from = new Date(`${query.from}T00:00:00.000Z`);
    if (!Number.isNaN(from.getTime())) createdAtFilter.$gte = from;
  }
  if (query.to) {
    const to = new Date(`${query.to}T23:59:59.999Z`);
    if (!Number.isNaN(to.getTime())) createdAtFilter.$lte = to;
  }
  if (query.olderThanDays) {
    const olderThan = new Date();
    olderThan.setUTCDate(olderThan.getUTCDate() - query.olderThanDays);
    createdAtFilter.$lte =
      createdAtFilter.$lte && createdAtFilter.$lte < olderThan ? createdAtFilter.$lte : olderThan;
  }
  if (Object.keys(createdAtFilter).length > 0) {
    clauses.push({ createdAt: createdAtFilter });
  }

  if (!opts.excludeStatusLike) {
    if (query.status !== "all") {
      clauses.push({ status: query.status });
    }
    if (query.queueBucket) {
      clauses.push({ queueBucket: query.queueBucket });
    }
    if (query.openOnly) {
      clauses.push({ status: { $in: [...OPEN_REQUEST_STATUSES] } });
    }
  }

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

export function getDbSort(query: ParsedAdminRequestsQuery) {
  if (query.sort === "age") {
    return {
      field: "createdAt" as const,
      direction: (query.direction === "desc" ? "asc" : "desc") as "asc" | "desc",
    };
  }

  return {
    field: query.sort,
    direction: query.direction as "asc" | "desc",
  };
}

export function encodeCursor(row: { _id: string; createdAt?: string; updatedAt?: string }, field: "createdAt" | "updatedAt") {
  const value = row[field];
  if (!value) return "";
  return Buffer.from(JSON.stringify({ id: row._id, value }), "utf8").toString("base64url");
}

export function decodeCursor(token: string): CursorPayload | null {
  if (!token) return null;

  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
      id?: string;
      value?: string;
    };
    if (!parsed.id || !parsed.value || !mongoose.Types.ObjectId.isValid(parsed.id)) return null;
    const value = new Date(parsed.value);
    if (Number.isNaN(value.getTime())) return null;
    return { id: parsed.id, value };
  } catch {
    return null;
  }
}

export function buildCursorFilter(opts: {
  field: "createdAt" | "updatedAt";
  direction: "asc" | "desc";
  cursor: CursorPayload;
  relation: "after" | "before";
}) {
  const operator =
    opts.relation === "after"
      ? opts.direction === "asc"
        ? "$gt"
        : "$lt"
      : opts.direction === "asc"
        ? "$lt"
        : "$gt";

  return {
    $or: [
      { [opts.field]: { [operator]: opts.cursor.value } },
      {
        [opts.field]: opts.cursor.value,
        _id: { [operator]: new mongoose.Types.ObjectId(opts.cursor.id) },
      },
    ],
  };
}

export function buildSortObject(field: "createdAt" | "updatedAt", direction: "asc" | "desc") {
  const numeric: 1 | -1 = direction === "asc" ? 1 : -1;
  return { [field]: numeric, _id: numeric } as Record<string, 1 | -1>;
}

export function invertDirection(direction: "asc" | "desc") {
  return direction === "asc" ? "desc" : "asc";
}

export function removeCursorParams(searchParams: URLSearchParams) {
  searchParams.delete("after");
  searchParams.delete("before");
}

export const ADMIN_REQUEST_STATUSES = STATUS_VALUES;
export const ADMIN_REQUEST_SORTS = SORT_VALUES;
export const ADMIN_REQUEST_DIRECTIONS = DIRECTION_VALUES;
export const ADMIN_REQUEST_VIEWS = SAVED_VIEW_VALUES;
