// src/routes/checkout.js
import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import { IProduct } from "../models/Product"

dotenv.config()
const router = express.Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string)

router.post("/create-session", async (req, res) => {
  try {
    const body = req.body;
    const lineItems = body?.items?.map((item: IProduct) => ({
      price_data: {
        currency: "czk",
        product_data: {
          name: item.name,
          images: [item.imageUrl],
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    })) || []

    if (body?.totals?.shipping) {
      lineItems.push({
        price_data: {
          currency: "czk",
          product_data: {
            name: "Doprava",
          },
          unit_amount: Math.round(body.totals.shipping * 100),
        },
        quantity: 1,
      })
    }
    const baseUrl = process.env.FRONTEND_URL || 'https://bubblena-fe.vercel.app'
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      customer_email: body?.customerInfo?.email || undefined,
      success_url: `${baseUrl}/order-confirmation?orderId=${body.orderId}`,
      cancel_url: `${baseUrl}/cancel`,
    });

    res.json({ url: session.url })
  } catch (error) {
    console.error("Stripe checkout error:", error)
    res.status(500).json({ error: "Failed to create checkout session" })
  }
});

export default router
