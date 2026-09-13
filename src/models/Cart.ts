import mongoose, { Schema, Document } from "mongoose";

/**
 * COMPATIBILITY LAYER – the preview storefront (bubblena-fe `main`) mirrors its
 * localStorage cart here. Nothing on the backend reads it; orders re-price
 * items from the request. Documents expire after 7 days (TTL index).
 */
export interface CartItem {
  productId: string;
  variantId?: string | number;
  quantity: number;
}

export interface Cart extends Document {
  cartId: string;
  items: CartItem[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

const CartItemSchema = new Schema<CartItem>(
  {
    productId: { type: String, required: true },
    variantId: { type: Schema.Types.Mixed },
    quantity: { type: Number, required: true, min: 1, max: 999 },
  },
  { _id: false }
);

const CartSchema = new Schema<Cart>(
  {
    cartId: { type: String, required: true, unique: true },
    items: { type: [CartItemSchema], default: [] },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      index: { expires: "0s" },
    },
  },
  { timestamps: true }
);

export const CartModel = mongoose.model<Cart>("Cart", CartSchema);
