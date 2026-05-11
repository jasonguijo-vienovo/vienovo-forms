import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const FORM_IMPORT_VERSION_EVENTS = ["draft-saved", "published", "repaired"] as const;
export type FormImportVersionEvent = (typeof FORM_IMPORT_VERSION_EVENTS)[number];

const formImportVersionSchema = new Schema(
  {
    importId: { type: Schema.Types.ObjectId, ref: "FormImport", required: true, index: true },
    slug: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    sourceVersion: { type: Number, required: true, min: 1, index: true },
    event: { type: String, enum: FORM_IMPORT_VERSION_EVENTS, required: true, index: true },
    sourceChecksum: { type: String, default: "", trim: true },
    readinessState: { type: String, default: "", trim: true },
    parseDiagnostics: { type: Schema.Types.Mixed, default: {} },
    summary: { type: Schema.Types.Mixed, default: {} },
    htmlSource: { type: String, default: "" },
    appsScriptSource: { type: String, default: "" },
    spreadsheetBindings: { type: Schema.Types.Mixed, default: {} },
    externalFormUrl: { type: String, default: "", trim: true },
    createdByEmail: { type: String, default: "", lowercase: true, trim: true },
  },
  { timestamps: true },
);

formImportVersionSchema.index({ importId: 1, sourceVersion: -1, event: 1 });
formImportVersionSchema.index({ slug: 1, sourceVersion: -1 });

export type FormImportVersionDoc = InferSchemaType<typeof formImportVersionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FormImportVersion: Model<FormImportVersionDoc> =
  (mongoose.models.FormImportVersion as Model<FormImportVersionDoc>) ||
  mongoose.model<FormImportVersionDoc>("FormImportVersion", formImportVersionSchema);
