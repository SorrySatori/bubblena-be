import mongoose, { Schema, Document } from "mongoose";

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
}

export interface CustomerAddress {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface CustomerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: CustomerAddress;
  billingAddressSameAsShipping: boolean;
}

export interface SelectedPickupPoint {
  id: string;
  name: string;
  city: string;
  street: string;
  zip: string;
  country: string;
  url?: string;
  gps?: { lat: number; lon: number };
  place?: string;
  branchCode?: string;
  routingCode?: string;
  routingName?: string;
}

export interface Totals {
  subtotal: number;
  shipping: number;
  paymentSurcharge: number;
  total: number;
}

export interface OrderDiscount {
  code: string;
  type: "global" | "individual";
  percentage: number;
  freeShipping: boolean;
  percentageDiscount: number;
  shippingDiscount: number;
  totalDiscount: number;
}

export interface Order extends Document {
  cartId?: string | null;
  userId?: string | null;
  orderId: string;
  customerInfo: CustomerInfo;
  shippingMethod: string;
  selectedPickupPoint?: SelectedPickupPoint;
  paymentMethod: string;
  orderNotes?: string;
  discount?: OrderDiscount;
  items: OrderItem[];
  totals: Totals;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderDiscountSchema = new Schema<OrderDiscount>(
  {
    code: String,
    type: String,
    percentage: Number,
    freeShipping: Boolean,
    percentageDiscount: Number,
    shippingDiscount: Number,
    totalDiscount: Number,
  },
  { _id: false }
);

const OrderSchema = new Schema<Order>(
  {
    cartId: { type: String, default: null },
    userId: { type: String, default: null, index: true },
    orderId: { type: String, required: true, unique: true },

    customerInfo: {
      firstName: String,
      lastName: String,
      email: String,
      phone: String,
      address: {
        street: String,
        city: String,
        postalCode: String,
        country: String,
      },
      billingAddressSameAsShipping: Boolean,
    },

    shippingMethod: { type: String, required: true },
    selectedPickupPoint: {
      id: String,
      name: String,
      city: String,
      street: String,
      zip: String,
      country: String,
      url: String,
      gps: { lat: Number, lon: Number },
      place: String,
      branchCode: String,
      routingCode: String,
      routingName: String,
    },

    paymentMethod: { type: String, required: true },
    orderNotes: { type: String, default: "" },
    discount: { type: OrderDiscountSchema, default: undefined },

    items: [
      {
        id: String,
        name: String,
        price: Number,
        quantity: Number,
        variant: {
          weight: Number,
        },
        imageUrl: String,
      },
    ],

    totals: {
      subtotal: Number,
      shipping: Number,
      paymentSurcharge: Number,
      total: Number,
    },

    status: { type: String, default: "pending" },
  },
  { timestamps: true }
);

export const OrderModel = mongoose.model<Order>("Order", OrderSchema);
