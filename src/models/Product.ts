import mongoose, { Schema, Document } from 'mongoose'

export interface IProduct extends Document {
  name: string
  shortDescription: string
  description: string
  price: number
  weight?: number
  inStock: boolean
  stockCount: number
  storageMethod: string
  imageUrl?: string
  bathImageUrl?: string
  videoUrl?: string
  createdAt: Date
  updatedAt: Date
  isDeleted?: boolean
}

const ProductSchema: Schema<IProduct> = new Schema(
  {
    name: { type: String, required: true },
    shortDescription: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    weight: { type: Number, required: true, default: 0 },
    inStock: { type: Boolean, default: true },
    stockCount: { type: Number, required: true },
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

export default mongoose.model<IProduct>('Product', ProductSchema)