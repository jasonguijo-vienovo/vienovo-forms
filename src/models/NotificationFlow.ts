import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const notificationFlowSchema = new Schema(
  {
    formSlug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    formName: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    notifyOnSubmit: { type: Boolean, default: true },
    notifyNextApprover: { type: Boolean, default: true },
    notifySubmitterOnApproved: { type: Boolean, default: true },
    notifySubmitterOnRejected: { type: Boolean, default: true },
    extraRecipients: { type: [String], default: [] },
    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export type NotificationFlowDoc = InferSchemaType<typeof notificationFlowSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const NotificationFlow: Model<NotificationFlowDoc> =
  (mongoose.models.NotificationFlow as Model<NotificationFlowDoc>) ||
  mongoose.model<NotificationFlowDoc>("NotificationFlow", notificationFlowSchema);
