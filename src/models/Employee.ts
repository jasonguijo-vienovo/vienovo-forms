import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const employeeSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    employeeId: { type: String, default: "" },
    fullName: { type: String, required: true, trim: true },
    department: { type: String, default: "" },
    contactNumber: { type: String, default: "" },
    birthday: { type: Date, default: null },
    supervisorEmail: { type: String, default: "", lowercase: true, trim: true },
    departmentHeadEmail: { type: String, default: "", lowercase: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type EmployeeDoc = InferSchemaType<typeof employeeSchema> & { _id: mongoose.Types.ObjectId };

export const Employee: Model<EmployeeDoc> =
  (mongoose.models.Employee as Model<EmployeeDoc>) ||
  mongoose.model<EmployeeDoc>("Employee", employeeSchema);
