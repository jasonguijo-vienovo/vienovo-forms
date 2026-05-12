import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const requestDraftSchema = new Schema(
  {
    formSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    formName: { type: String, default: "", trim: true },
    userEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    userName: { type: String, default: "", trim: true },
    values: { type: Schema.Types.Mixed, default: {} },
    labels: { type: Schema.Types.Mixed, default: {} },
    source: { type: String, enum: ["imported-runtime", "native"], default: "imported-runtime" },
    lastSavedAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

requestDraftSchema.index({ userEmail: 1, formSlug: 1 }, { unique: true });

export type RequestDraftDoc = InferSchemaType<typeof requestDraftSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RequestDraft: Model<RequestDraftDoc> =
  (mongoose.models.RequestDraft as Model<RequestDraftDoc>) ||
  mongoose.model<RequestDraftDoc>("RequestDraft", requestDraftSchema);
