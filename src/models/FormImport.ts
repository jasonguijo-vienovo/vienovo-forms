import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const FORM_IMPORT_STATUSES = ["draft", "reviewed", "implemented"] as const;
export type FormImportStatus = (typeof FORM_IMPORT_STATUSES)[number];
export const FORM_IMPORT_READINESS_STATES = ["ready", "needs-review", "blocked"] as const;
export type FormImportReadinessState = (typeof FORM_IMPORT_READINESS_STATES)[number];

const formImportSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, index: true },
    sourceType: { type: String, default: "google-apps-script" },
    externalFormUrl: { type: String, default: "", trim: true },
    spreadsheetId: { type: String, default: "", trim: true },
    spreadsheetBindings: { type: Schema.Types.Mixed, default: {} },
    writeResponsesToSheet: { type: Boolean, default: false },
    responseSheetName: { type: String, default: "", trim: true },
    htmlSource: { type: String, default: "" },
    appsScriptSource: { type: String, default: "" },
    notes: { type: String, default: "" },
    status: { type: String, enum: FORM_IMPORT_STATUSES, default: "draft", index: true },
    readinessState: {
      type: String,
      enum: FORM_IMPORT_READINESS_STATES,
      default: "needs-review",
      index: true,
    },
    sourceChecksum: { type: String, default: "", trim: true },
    sourceVersion: { type: Number, default: 1, min: 1 },
    lastParsedAt: { type: Date, default: null },
    parseDiagnostics: {
      parsedTitle: { type: String, default: "" },
      parsedDescription: { type: String, default: "" },
      parsedFieldCount: { type: Number, default: 0 },
      fieldNames: { type: [String], default: [] },
      detectedTriggerFunctions: { type: [String], default: [] },
      detectedTriggerEvents: { type: [String], default: [] },
      missingBindings: { type: [String], default: [] },
      warnings: { type: [String], default: [] },
      blockers: { type: [String], default: [] },
      warningCount: { type: Number, default: 0 },
      blockerCount: { type: Number, default: 0 },
    },
    createdByEmail: { type: String, default: "", lowercase: true, trim: true },
    createdByName: { type: String, default: "", trim: true },
    summary: {
      inputCount: { type: Number, default: 0 },
      selectCount: { type: Number, default: 0 },
      textareaCount: { type: Number, default: 0 },
      scriptFunctionCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

formImportSchema.index({ createdAt: -1 });
formImportSchema.index({ slug: 1, updatedAt: -1 });
formImportSchema.index({ status: 1, readinessState: 1, updatedAt: -1 });

export type FormImportDoc = InferSchemaType<typeof formImportSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FormImport: Model<FormImportDoc> =
  (mongoose.models.FormImport as Model<FormImportDoc>) ||
  mongoose.model<FormImportDoc>("FormImport", formImportSchema);
