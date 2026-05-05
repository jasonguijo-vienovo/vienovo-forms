import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const auditLogSchema = new Schema(
  {
    actorEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    action: { type: String, required: true, trim: true, index: true },
    targetType: { type: String, required: true, trim: true },
    targetId: { type: String, default: "", trim: true },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AuditLog: Model<AuditLogDoc> =
  (mongoose.models.AuditLog as Model<AuditLogDoc>) ||
  mongoose.model<AuditLogDoc>("AuditLog", auditLogSchema);

