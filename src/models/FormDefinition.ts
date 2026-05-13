import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const FORM_DEFINITION_STATUSES = ["draft", "published", "archived"] as const;
export type FormDefinitionStatus = (typeof FORM_DEFINITION_STATUSES)[number];

export const FORM_DEFINITION_VISIBILITIES = ["everyone", "admin"] as const;
export type FormDefinitionVisibility = (typeof FORM_DEFINITION_VISIBILITIES)[number];

export const FORM_DEFINITION_AVAILABILITIES = ["available", "coming-soon"] as const;
export type FormDefinitionAvailability = (typeof FORM_DEFINITION_AVAILABILITIES)[number];

export const FORM_DEFINITION_SOURCES = ["native", "imported"] as const;
export type FormDefinitionSource = (typeof FORM_DEFINITION_SOURCES)[number];

const formDefinitionSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    routePath: { type: String, default: "", trim: true },
    externalFormUrl: { type: String, default: "", trim: true },
    source: { type: String, enum: FORM_DEFINITION_SOURCES, required: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    status: { type: String, enum: FORM_DEFINITION_STATUSES, default: "draft", index: true },
    visibility: {
      type: String,
      enum: FORM_DEFINITION_VISIBILITIES,
      default: "everyone",
      index: true,
    },
    availability: {
      type: String,
      enum: FORM_DEFINITION_AVAILABILITIES,
      default: "available",
      index: true,
    },
    isImplemented: { type: Boolean, default: false, index: true },
    showInNavbar: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0, index: true },
    writeResponsesToSheet: { type: Boolean, default: false },
    responseSpreadsheetId: { type: String, default: "", trim: true },
    responseSheetName: { type: String, default: "", trim: true },
    triggerEnabled: { type: Boolean, default: false },
    triggerUrl: { type: String, default: "", trim: true },
    triggerSource: { type: String, default: "", trim: true },
    triggerEvent: { type: String, default: "", trim: true },
    triggerFunctionName: { type: String, default: "", trim: true },
    triggerNotes: { type: String, default: "", trim: true },
    importSourceId: { type: Schema.Types.ObjectId, ref: "FormImport", default: null },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

formDefinitionSchema.index({ status: 1, visibility: 1, sortOrder: 1 });
formDefinitionSchema.index({
  visibility: 1,
  availability: 1,
  status: 1,
  isImplemented: 1,
  showInNavbar: 1,
  sortOrder: 1,
});
formDefinitionSchema.index({ source: 1, status: 1, sortOrder: 1 });

export type FormDefinitionDoc = InferSchemaType<typeof formDefinitionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FormDefinition: Model<FormDefinitionDoc> =
  (mongoose.models.FormDefinition as Model<FormDefinitionDoc>) ||
  mongoose.model<FormDefinitionDoc>("FormDefinition", formDefinitionSchema);
