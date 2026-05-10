import mongoose, { Schema, Document } from "mongoose";

export type DiscountCodeType = "global" | "individual";

export interface IDiscountCode extends Document {
  code: string;
  type: DiscountCodeType;
  percentage: number;
  freeShipping: boolean;
  validUntil?: Date;
  isActive: boolean;
  usedAt?: Date;
  usedByOrderId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DiscountCodeSchema = new Schema<IDiscountCode>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ["global", "individual"], required: true },
    percentage: { type: Number, default: 0, min: 0, max: 100 },
    freeShipping: { type: Boolean, default: false },
    validUntil: { type: Date },
    isActive: { type: Boolean, default: true },
    usedAt: { type: Date },
    usedByOrderId: { type: String },
  },
  { timestamps: true }
);

DiscountCodeSchema.index({ type: 1, isActive: 1 });

export const DiscountCodeModel = mongoose.model<IDiscountCode>("DiscountCode", DiscountCodeSchema);
