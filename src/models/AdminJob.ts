import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const ADMIN_JOB_TYPES = [
  "employee-sync",
  "import-sync",
  "import-publish",
  "bulk-approval",
] as const;
export type AdminJobType = (typeof ADMIN_JOB_TYPES)[number];

export const ADMIN_JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type AdminJobStatus = (typeof ADMIN_JOB_STATUSES)[number];

const adminJobSchema = new Schema(
  {
    type: { type: String, enum: ADMIN_JOB_TYPES, required: true, index: true },
    status: { type: String, enum: ADMIN_JOB_STATUSES, required: true, index: true },
    actorEmail: { type: String, default: "", lowercase: true, trim: true, index: true },
    targetType: { type: String, default: "", trim: true },
    targetId: { type: String, default: "", trim: true },
    summary: { type: String, default: "", trim: true },
    errorMessage: { type: String, default: "", trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    retryCount: { type: Number, default: 0 },
    queuedAt: { type: Date, default: null, index: true },
    lastHeartbeatAt: { type: Date, default: null },
    startedAt: { type: Date, default: Date.now, index: true },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
  },
  { timestamps: true },
);

adminJobSchema.index({ type: 1, startedAt: -1 });
adminJobSchema.index({ status: 1, startedAt: -1 });

export type AdminJobDoc = InferSchemaType<typeof adminJobSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AdminJob: Model<AdminJobDoc> =
  (mongoose.models.AdminJob as Model<AdminJobDoc>) ||
  mongoose.model<AdminJobDoc>("AdminJob", adminJobSchema);
