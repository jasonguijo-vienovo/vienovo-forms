import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const LOOKUP_CATEGORIES = [
  "department",
  "airport",
  "multiCityDeparture",
  "airline",
  "baggage",
  "cashAdvancePayableTo",
  "reimbursementFormType",
  "reimbursementCostCenter",
  "reimbursementLocation",
  "reimbursementLiquidationType",
] as const;

export type LookupCategory = (typeof LOOKUP_CATEGORIES)[number];

const lookupSchema = new Schema(
  {
    category: { type: String, enum: LOOKUP_CATEGORIES, required: true, index: true },
    value: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

lookupSchema.index({ category: 1, value: 1 }, { unique: true });

export type LookupDoc = InferSchemaType<typeof lookupSchema> & { _id: mongoose.Types.ObjectId };

export const Lookup: Model<LookupDoc> =
  (mongoose.models.Lookup as Model<LookupDoc>) ||
  mongoose.model<LookupDoc>("Lookup", lookupSchema);
