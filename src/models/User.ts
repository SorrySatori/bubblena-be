import mongoose, { Schema, Document } from "mongoose";

export interface UserAddress {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export type AuthProvider = "local" | "google";

export interface IUser extends Document {
  email: string;
  passwordHash?: string | null;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: UserAddress;
  googleId?: string | null;
  authProvider: AuthProvider;
  emailVerified: boolean;
  verifyToken?: string | null;
  verifyTokenExpires?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Not selected by default so it never leaks through generic queries.
    passwordHash: { type: String, default: null, select: false },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      postalCode: { type: String, default: "" },
      country: { type: String, default: "CZ" },
    },
    googleId: { type: String, default: null },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    emailVerified: { type: Boolean, default: false },
    // Likewise hidden from generic queries.
    verifyToken: { type: String, default: null, select: false },
    verifyTokenExpires: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<IUser>("User", UserSchema);
