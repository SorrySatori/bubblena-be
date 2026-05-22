import mongoose, { Schema, Document } from 'mongoose'

export interface BombVariant {
  weight: number;
  price: number;
  stockCount: number;
  inStock: boolean;
}

export interface BombBatch {
  _id?: mongoose.Types.ObjectId;
  batchId: string;
  variants: BombVariant[];
}

export interface BombLot {
  _id?: mongoose.Types.ObjectId;
  lotNumber: string;
  batches: BombBatch[];
}

export interface BombPricing {
  weight: number;
  price: number;
}

export interface IBomb extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  acronym: string;
  shortDescription?: string;
  description: string;
  imageUrl?: string;
  bathImageUrl?: string;
  videoUrl?: string;
  category?: string;
  storageMethod?: string;
  pricing: BombPricing[];
  lots: BombLot[];
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
}

const BombSchema: Schema<IBomb> = new Schema(
  {
    name: { type: String, required: true },
    acronym: { type: String, required: true },
    shortDescription: { type: String, required: true },
    description: { type: String, required: true },
    pricing: [
      {
        weight: { type: Number, required: true },
        price: { type: Number, required: true },
      },
    ],
    lots: [
      {
        lotNumber: { type: String, required: true },
        batches: [
          {
            batchId: { type: String, required: true },
            variants: [
              {
                price: { type: Number, required: true },
                weight: { type: Number, required: true, default: 0 },
                inStock: { type: Boolean, default: true },
                stockCount: { type: Number, required: true, min: 0 },
              },
            ],
          },
        ],
      },
    ],
    storageMethod: { type: String, required: true },
    imageUrl: { type: String },
    videoUrl: { type: String },
    bathImageUrl: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model<IBomb>('Bomb', BombSchema)
