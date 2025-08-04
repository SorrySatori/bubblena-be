import mongoose, { Schema, Document } from 'mongoose'

export interface IProduct extends Document {
  name: string
  shortDescription: string
  description: string
  price: number
  inStock: boolean
  stockCount: number
  imageUrl?: string
  createdAt: Date
  updatedAt: Date
}

const ProductSchema: Schema<IProduct> = new Schema(
  {
    name: { type: String, required: true },
    shortDescription: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    inStock: { type: Boolean, default: true },
    stockCount: { type: Number, required: true },
    imageUrl: { type: String },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model<IProduct>('Product', ProductSchema)