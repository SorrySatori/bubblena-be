import mongoose, { Schema, Document } from 'mongoose'

export interface ProductVariant {
  weight: number;
  price: number;
  stockCount: number;
  inStock: boolean;
}

export interface IProduct extends Document {
  _id: string;
  name: string;
  shortDescription?: string;
  description: string;
  imageUrl?: string;
  bathImageUrl?: string;
  videoUrl?: string;
  category?: string;
  storageMethod?: string;
  variants: ProductVariant[]
  ingredients: string;
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
}

const ProductSchema: Schema<IProduct> = new Schema(
  {
    name: { type: String, required: true },
    shortDescription: { type: String, required: true },
    description: { type: String, required: true },
    variants: {
      price: { type: Number, required: true },
      weight: { type: Number, required: true, default: 0 },
      inStock: { type: Boolean, default: true },
      stockCount: { type: Number, required: true },
    },
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