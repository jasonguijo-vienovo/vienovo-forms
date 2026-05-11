import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const notificationDeliveryLogSchema = new Schema(
  {
    formSlug: { type: String, default: "", lowercase: true, trim: true, index: true },
    formName: { type: String, default: "", trim: true },
    event: { type: String, default: "", trim: true, index: true },
    recipient: { type: String, default: "", lowercase: true, trim: true, index: true },
    subject: { type: String, default: "", trim: true },
    status: { type: String, enum: ["sent", "failed", "skipped"], default: "sent", index: true },
    error: { type: String, default: "" },
    text: { type: String, default: "" },
    html: { type: String, default: "" },
    replayable: { type: Boolean, default: false, index: true },
    retryOfLogId: { type: Schema.Types.ObjectId, default: null, index: true },
    resentAt: { type: Date, default: null },
    resentByEmail: { type: String, default: "", lowercase: true, trim: true },
    sentAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

notificationDeliveryLogSchema.index({ sentAt: -1 });

export type NotificationDeliveryLogDoc = InferSchemaType<typeof notificationDeliveryLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const NotificationDeliveryLog: Model<NotificationDeliveryLogDoc> =
  (mongoose.models.NotificationDeliveryLog as Model<NotificationDeliveryLogDoc>) ||
  mongoose.model<NotificationDeliveryLogDoc>("NotificationDeliveryLog", notificationDeliveryLogSchema);

