import mongoose, { Schema, Document } from "mongoose";

export interface CartItem {
  productId: mongoose.Types.ObjectId;
  variantId?: mongoose.Types.ObjectId;
  quantity: number;
}

export interface Cart extends Document {
  cartId: string;
  items: CartItem[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

const CartItemSchema = new Schema<CartItem>({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: Schema.Types.ObjectId, ref: "Variant" },
  quantity: { type: Number, required: true, min: 1 },
});

const CartSchema = new Schema<Cart>(
  {
    cartId: { type: String, required: true, unique: true },
    items: [CartItemSchema],
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // default 7 dní
      index: { expires: "0s" }, // TTL index – Mongo automaticky smaže po vypršení
    },
  },
  { timestamps: true }
);

export const CartModel = mongoose.model<Cart>("Cart", CartSchema);
