import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const FORM_TYPES = [
  "travel-booking",
  "cash-advance",
  "reimbursement",
  "request-for-payment",
  "cashiering",
  "imported",
] as const;
export type FormType = (typeof FORM_TYPES)[number];

export const REQUEST_STATUSES = ["pending", "approved", "rejected", "returned", "submitted"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const APPROVAL_STEP_STATUSES = [
  "waiting",
  "pending",
  "approved",
  "rejected",
  "edited",
  "skipped",
] as const;
export type ApprovalStepStatus = (typeof APPROVAL_STEP_STATUSES)[number];

const approvalStepSchema = new Schema(
  {
    step: { type: Number, required: true },
    role: { type: String, required: true },
    approverEmail: { type: String, required: true, lowercase: true, trim: true },
    approverName: { type: String, default: "" },
    status: { type: String, enum: APPROVAL_STEP_STATUSES, default: "waiting" },
    actedAt: { type: Date, default: null },
    comment: { type: String, default: "" },
  },
  { _id: false }
);

const historySchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    byEmail: { type: String, default: "", lowercase: true, trim: true },
    byName: { type: String, default: "" },
    action: { type: String, required: true },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const requestSchema = new Schema(
  {
    formType: { type: String, enum: FORM_TYPES, required: true, index: true },
    formSlug: { type: String, default: "", lowercase: true, trim: true, index: true },
    formName: { type: String, default: "", trim: true },
    referenceNo: { type: String, required: true, unique: true, index: true },
    requestNo: { type: String, default: "" },
    submittedBy: {
      email: { type: String, required: true, lowercase: true, trim: true, index: true },
      name: { type: String, default: "" },
    },
    formData: { type: Schema.Types.Mixed, default: {} },
    approvalChain: { type: [approvalStepSchema], default: [] },
    currentStep: { type: Number, default: 0 },
    status: { type: String, enum: REQUEST_STATUSES, default: "pending", index: true },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true }
);

requestSchema.index({ "submittedBy.email": 1, status: 1, createdAt: -1 });
requestSchema.index({ formSlug: 1, createdAt: -1 });

export type RequestDoc = InferSchemaType<typeof requestSchema> & { _id: mongoose.Types.ObjectId };

export const RequestModel: Model<RequestDoc> =
  (mongoose.models.Request as Model<RequestDoc>) ||
  mongoose.model<RequestDoc>("Request", requestSchema);
