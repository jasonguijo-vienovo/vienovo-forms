import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const employeeSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    employeeId: { type: String, default: "" },
    entraUserId: { type: String, default: "", trim: true, index: true },
    fullName: { type: String, required: true, trim: true },
    department: { type: String, default: "" },
    jobTitle: { type: String, default: "" },
    contactNumber: { type: String, default: "" },
    birthday: { type: Date, default: null },
    supervisorEmail: { type: String, default: "", lowercase: true, trim: true },
    departmentHeadEmail: { type: String, default: "", lowercase: true, trim: true },
    isActive: { type: Boolean, default: true },
    syncSource: { type: String, default: "", trim: true },
    lastSyncedAt: { type: Date, default: null, index: true },
    deviceSummary: {
      deviceCount: { type: Number, default: 0 },
      compliantDeviceCount: { type: Number, default: 0 },
      nonCompliantDeviceCount: { type: Number, default: 0 },
      lastSyncAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

export type EmployeeDoc = InferSchemaType<typeof employeeSchema> & { _id: mongoose.Types.ObjectId };

export const Employee: Model<EmployeeDoc> =
  (mongoose.models.Employee as Model<EmployeeDoc>) ||
  mongoose.model<EmployeeDoc>("Employee", employeeSchema);
