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

export type BuiltInLookupCategory = (typeof LOOKUP_CATEGORIES)[number];
export type LookupCategory = BuiltInLookupCategory | string;

export function normalizeLookupKey(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function importedLookupCategory(slug: string, fieldName: string) {
  return `imported:${normalizeLookupKey(slug)}:${normalizeLookupKey(fieldName)}`;
}

export function parseImportedLookupCategory(category: string) {
  const match = category.match(/^imported:([a-z0-9]+):([a-z0-9]+)$/);
  if (!match) return null;
  return { slugKey: match[1], fieldKey: match[2] };
}

const lookupSchema = new Schema(
  {
    category: { type: String, required: true, index: true },
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
