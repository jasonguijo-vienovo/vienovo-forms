import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const systemSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true, trim: true },
    value: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

export type SystemSettingDoc = InferSchemaType<typeof systemSettingSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const SystemSetting: Model<SystemSettingDoc> =
  (mongoose.models.SystemSetting as Model<SystemSettingDoc>) ||
  mongoose.model<SystemSettingDoc>("SystemSetting", systemSettingSchema);
