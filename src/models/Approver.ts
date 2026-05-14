import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const APPROVER_ROLES = [
  "supervisor",
  "head",
  "sla",
  "processor",
  "cashAdvanceApprover",
  "hr",
  "ceo",
] as const;
export type ApproverRole = (typeof APPROVER_ROLES)[number];

const approverSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, default: "", lowercase: true, trim: true, index: true },
    employeeId: { type: String, default: "", trim: true, index: true },
    roles: {
      type: [{ type: String }],
      default: [],
    },
    department: { type: String, default: "" },
    jobTitle: { type: String, default: "" },
    emailNeedsReview: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

approverSchema.index({ name: 1 }, { unique: true });

export type ApproverDoc = InferSchemaType<typeof approverSchema> & { _id: mongoose.Types.ObjectId };

export const Approver: Model<ApproverDoc> =
  (mongoose.models.Approver as Model<ApproverDoc>) ||
  mongoose.model<ApproverDoc>("Approver", approverSchema);
