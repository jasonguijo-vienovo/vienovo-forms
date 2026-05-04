import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const FORM_IMPORT_STATUSES = ["draft", "reviewed", "implemented"] as const;
export type FormImportStatus = (typeof FORM_IMPORT_STATUSES)[number];

const formImportSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, index: true },
    sourceType: { type: String, default: "google-apps-script" },
    spreadsheetId: { type: String, default: "", trim: true },
    spreadsheetBindings: { type: Schema.Types.Mixed, default: {} },
    htmlSource: { type: String, default: "" },
    appsScriptSource: { type: String, default: "" },
    notes: { type: String, default: "" },
    status: { type: String, enum: FORM_IMPORT_STATUSES, default: "draft", index: true },
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

export type FormImportDoc = InferSchemaType<typeof formImportSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FormImport: Model<FormImportDoc> =
  (mongoose.models.FormImport as Model<FormImportDoc>) ||
  mongoose.model<FormImportDoc>("FormImport", formImportSchema);
