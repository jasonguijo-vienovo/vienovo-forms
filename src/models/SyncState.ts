import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const SYNC_STATE_KEYS = ["employee-graph-users"] as const;
export type SyncStateKey = (typeof SYNC_STATE_KEYS)[number];

const syncStateSchema = new Schema(
  {
    key: { type: String, enum: SYNC_STATE_KEYS, required: true, unique: true, index: true },
    cursorUrl: { type: String, default: "", trim: true },
    lastMode: { type: String, enum: ["full", "delta"], default: "full" },
    lastStartedAt: { type: Date, default: null },
    lastCompletedAt: { type: Date, default: null },
    lastSucceededAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
    lastErrorMessage: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

export type SyncStateDoc = InferSchemaType<typeof syncStateSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const SyncState: Model<SyncStateDoc> =
  (mongoose.models.SyncState as Model<SyncStateDoc>) ||
  mongoose.model<SyncStateDoc>("SyncState", syncStateSchema);
