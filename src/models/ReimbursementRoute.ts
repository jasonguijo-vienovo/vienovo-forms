import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const reimbursementRouteSchema = new Schema(
  {
    department: { type: String, required: true, trim: true, index: true },
    costCenter: { type: String, required: true, trim: true, index: true },
    location: { type: String, required: true, trim: true, index: true },

    supervisorEmail: { type: String, default: "", lowercase: true, trim: true },
    supervisorName: { type: String, default: "", trim: true },
    headEmail: { type: String, default: "", lowercase: true, trim: true },
    headName: { type: String, default: "", trim: true },

    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

reimbursementRouteSchema.index(
  { department: 1, costCenter: 1, location: 1 },
  { unique: true }
);

export type ReimbursementRouteDoc = InferSchemaType<typeof reimbursementRouteSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ReimbursementRoute: Model<ReimbursementRouteDoc> =
  (mongoose.models.ReimbursementRoute as Model<ReimbursementRouteDoc>) ||
  mongoose.model<ReimbursementRouteDoc>("ReimbursementRoute", reimbursementRouteSchema);

