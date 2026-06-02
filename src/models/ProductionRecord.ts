import mongoose, { Schema, Document } from 'mongoose'

// Which raw-material batch was used (FIFO) and how much (grams).
export interface SourceBatch {
  batchId: string; // RawMaterialBatch _id
  batchNumber: string; // supplier batch number
  quantityUsed: number; // grams
}

export interface MaterialConsumption {
  materialId: string;
  materialName: string;
  quantity: number; // total grams consumed for this material
  sourceBatches: SourceBatch[];
}

export interface ProductionSize {
  weight: number; // grams per piece
  quantity: number; // how many pieces of this size
}

export interface IProductionRecord extends Document {
  _id: mongoose.Types.ObjectId;
  recipeId: string;
  recipeName: string;
  recipeAcronym: string;
  batchNumber: string; // assigned batchId from the product (e.g. "KB-001")
  lotNumber: string; // assigned lotNumber (e.g. "BB-KB-001")
  productType?: 'bomb' | 'steamer' | null; // which finished-product collection got the batch
  productId?: string; // Bomb/Steamer _id
  sizes: ProductionSize[];
  dateProduced: string; // ISO date
  expiryDate?: string;
  materialsUsed: MaterialConsumption[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

const ProductionRecordSchema: Schema<IProductionRecord> = new Schema(
  {
    recipeId: { type: String, required: true },
    recipeName: { type: String, required: true },
    recipeAcronym: { type: String, required: true },
    batchNumber: { type: String, required: true },
    lotNumber: { type: String, default: '' },
    productType: { type: String, enum: ['bomb', 'steamer', null], default: null },
    productId: { type: String },
    sizes: [
      {
        weight: { type: Number, required: true },
        quantity: { type: Number, required: true, min: 0 },
      },
    ],
    dateProduced: { type: String, required: true },
    expiryDate: { type: String },
    materialsUsed: [
      {
        materialId: { type: String, required: true },
        materialName: { type: String, required: true },
        quantity: { type: Number, required: true },
        sourceBatches: [
          {
            batchId: { type: String },
            batchNumber: { type: String, required: true },
            quantityUsed: { type: Number, required: true },
          },
        ],
      },
    ],
    notes: { type: String },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model<IProductionRecord>('ProductionRecord', ProductionRecordSchema)
