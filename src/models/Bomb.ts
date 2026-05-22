import mongoose, { Schema, Document } from 'mongoose'

export interface BombVariant {
  weight: number;
  price: number;
  stockCount: number;
  inStock: boolean;
}

export interface BombBatch {
  _id?: mongoose.Types.ObjectId;
  variants: BombVariant[];
}

export interface BombLot {
  _id?: mongoose.Types.ObjectId;
  batches: BombBatch[];
}

export interface IBomb extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  shortDescription?: string;
  description: string;
  imageUrl?: string;
  bathImageUrl?: string;
  videoUrl?: string;
  category?: string;
  storageMethod?: string;
  lots: BombLot[];
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
}

const BombSchema: Schema<IBomb> = new Schema(
  {
    name: { type: String, required: true },
    shortDescription: { type: String, required: true },
    description: { type: String, required: true },
    lots: [
      {
        batches: [
          {
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
