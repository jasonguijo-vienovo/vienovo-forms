import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const APP_USER_ROLES = ["user", "admin"] as const;
export type AppUserRole = (typeof APP_USER_ROLES)[number];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, default: "" },
    image: { type: String, default: "" },
    role: { type: String, enum: APP_USER_ROLES, default: "user", index: true },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ||
  mongoose.model<UserDoc>("User", userSchema);
