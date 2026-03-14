import mongoose, { Schema, Document } from 'mongoose'

export interface IDamagedProduct extends Document {
  _id: string;
  bathBombType: string;
  weight: number;
  price: number;
  damageLevel: 'lehce' | 'stredne' | 'prach';
  stockCount: number;
  inStock: boolean;
  imageUrl?: string;
  description?: string;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const DamagedProductSchema: Schema<IDamagedProduct> = new Schema(
  {
    bathBombType: { type: String, required: true },
    weight: { type: Number, required: true },
    price: { type: Number, required: true },
    damageLevel: { 
      type: String, 
      required: true, 
      enum: ['lehce', 'stredne', 'prach'] 
    },
    stockCount: { type: Number, required: true, default: 0 },
    inStock: { type: Boolean, default: true },
    imageUrl: { type: String },
    description: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model<IDamagedProduct>('DamagedProduct', DamagedProductSchema)
