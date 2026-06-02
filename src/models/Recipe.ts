import mongoose, { Schema, Document } from 'mongoose'

// Recipe ingredient. Quantity is in GRAMS (per one production batch).
export interface RecipeIngredient {
  materialId: string;
  materialName: string;
  quantity: number; // grams per batch
}

export interface IRecipe extends Document {
  _id: mongoose.Types.ObjectId;
  name: string; // e.g. "Kokobana"
  acronym: string; // e.g. "KB"
  ingredients: RecipeIngredient[];
  productType?: 'bomb' | 'steamer' | null; // which finished-product collection this recipe produces
  productId?: string; // Bomb/Steamer _id this recipe is bound to
  notes?: string;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const RecipeSchema: Schema<IRecipe> = new Schema(
  {
    name: { type: String, required: true },
    acronym: { type: String, required: true },
    ingredients: [
      {
        materialId: { type: String, required: true },
        materialName: { type: String, required: true },
        quantity: { type: Number, required: true, min: 0 },
      },
    ],
    productType: { type: String, enum: ['bomb', 'steamer', null], default: null },
    productId: { type: String },
    notes: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model<IRecipe>('Recipe', RecipeSchema)
