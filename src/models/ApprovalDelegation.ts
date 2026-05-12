import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const approvalDelegationSchema = new Schema(
  {
    delegatorEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    delegatorName: { type: String, default: "", trim: true },
    delegateEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    delegateName: { type: String, default: "", trim: true },
    reason: { type: String, default: "", trim: true },
    startsAt: { type: Date, default: Date.now, index: true },
    endsAt: { type: Date, default: null, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdByEmail: { type: String, default: "", lowercase: true, trim: true },
    revokedAt: { type: Date, default: null },
    revokedByEmail: { type: String, default: "", lowercase: true, trim: true },
  },
  { timestamps: true },
);

approvalDelegationSchema.index({ delegatorEmail: 1, delegateEmail: 1, isActive: 1 });
approvalDelegationSchema.index({ delegateEmail: 1, startsAt: 1, endsAt: 1 });

export type ApprovalDelegationDoc = InferSchemaType<typeof approvalDelegationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ApprovalDelegation: Model<ApprovalDelegationDoc> =
  (mongoose.models.ApprovalDelegation as Model<ApprovalDelegationDoc>) ||
  mongoose.model<ApprovalDelegationDoc>("ApprovalDelegation", approvalDelegationSchema);
