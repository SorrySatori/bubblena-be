import mongoose, { Schema, Document } from 'mongoose'

export interface SteamerBatch {
  _id?: mongoose.Types.ObjectId;
  batchId: string;
  stockCount: number;
}

export interface SteamerLot {
  _id?: mongoose.Types.ObjectId;
  lotNumber: string;
  batches: SteamerBatch[];
}

export interface ISteamer extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  shortDescription?: string;
  description: string;
  price: number;
  weight: number;
  stockCount: number;
  inStock: boolean;
  imageUrl?: string;
  videoUrl?: string;
  category?: string;
  storageMethod?: string;
  ingredients: string;
  lots: SteamerLot[];
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
}

const SteamerSchema: Schema<ISteamer> = new Schema(
  {
    name: { type: String, required: true },
    shortDescription: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    weight: { type: Number, required: true, default: 0 },
    stockCount: { type: Number, required: true },
    inStock: { type: Boolean, default: true },
    imageUrl: { type: String },
    videoUrl: { type: String },
    category: { type: String },
    storageMethod: { type: String, required: true },
    ingredients: { type: String, required: true },
    lots: [
      {
        lotNumber: { type: String, required: true },
        batches: [
          {
            batchId: { type: String, required: true },
            stockCount: { type: Number, required: true, min: 0 },
          },
        ],
      },
    ],
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model<ISteamer>('Steamer', SteamerSchema)
