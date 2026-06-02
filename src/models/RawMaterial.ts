import mongoose, { Schema, Document } from 'mongoose'

// A supplier intake batch (šarže) of a raw material. All quantities are in GRAMS.
export interface RawMaterialBatch {
  _id?: mongoose.Types.ObjectId;
  batchNumber: string; // supplier batch number (šarže)
  quantity: number; // current remaining quantity in grams
  initialQuantity: number; // original quantity when stocked, grams
  dateStocked: string; // ISO date
  consumed: boolean; // fully used up
  dateConsumed?: string; // when it was fully used
}

export interface IRawMaterial extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  currentStock: number; // total grams across all non-consumed batches
  lowStockThreshold: number; // alert when below this (grams)
  supplierName?: string;
  purchaseLink?: string;
  notes?: string;
  batches: RawMaterialBatch[];
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const RawMaterialSchema: Schema<IRawMaterial> = new Schema(
  {
    name: { type: String, required: true },
    currentStock: { type: Number, required: true, default: 0 },
    lowStockThreshold: { type: Number, required: true, default: 0 },
    supplierName: { type: String },
    purchaseLink: { type: String },
    notes: { type: String },
    batches: [
      {
        batchNumber: { type: String, required: true },
        quantity: { type: Number, required: true, min: 0 },
        initialQuantity: { type: Number, required: true, min: 0 },
        dateStocked: { type: String, required: true },
        consumed: { type: Boolean, default: false },
        dateConsumed: { type: String },
      },
    ],
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model<IRawMaterial>('RawMaterial', RawMaterialSchema)
