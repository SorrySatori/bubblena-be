// src/routes/checkout.js
import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"

dotenv.config()
const router = express.Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// POST /api/checkout/create-session
router.post("/create-session", async (req, res) => {
  try {
    const body = req.body;
    const lineItems = body?.items?.map((item) => ({
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

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: 'https://bubblena-fe.vercel.app/order-confirmation',
      cancel_url: 'https://bubblena-fe.vercel.app/cancel',
    });

    res.json({ url: session.url })
  } catch (error) {
    console.error("Stripe checkout error:", error)
    res.status(500).json({ error: "Failed to create checkout session" })
  }
});

export default router
