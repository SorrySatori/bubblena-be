import express from "express"
import { stripe } from "../config/stripe"
import { OrderModel } from "../models/Order"
import { orderAccessToken } from "../utils/orderToken"

const router = express.Router()

const frontendBase = () => (process.env.FRONTEND_URL || "https://bubblena.cz").replace(/\/$/, "")
const toStripeAmount = (czk: number) => Math.max(0, Math.round(czk * 100))

/**
 * POST /api/checkout/create-session  { orderId }
 *
 * Builds the Stripe Checkout session from the ORDER STORED IN THE DATABASE
 * (prices were resolved server-side in /api/order/create). The request body
 * only identifies the order; nothing price-related is read from it.
 */
router.post("/create-session", async (req, res) => {
  try {
    const orderId = typeof req.body?.orderId === "string" ? req.body.orderId : ""
    if (!orderId) {
      return res.status(400).json({ error: "Chybí orderId." })
    }

    const order = await OrderModel.findOne({ orderId })
    if (!order) {
      return res.status(404).json({ error: "Objednávka nenalezena." })
    }
    if (order.paymentMethod !== "card") {
      return res.status(400).json({ error: "Objednávka není určena k platbě kartou." })
    }
    if (order.status !== "pending") {
      return res.status(409).json({ error: "Objednávka už byla zaplacena nebo zrušena." })
    }

    const lineItems: any[] = order.items.map((item: any) => ({
      price_data: {
        currency: "czk",
        product_data: {
          name: item.name,
          ...(typeof item.imageUrl === "string" && /^https?:\/\//.test(item.imageUrl)
            ? { images: [item.imageUrl] }
            : {}),
        },
        unit_amount: toStripeAmount(item.price),
      },
      quantity: item.quantity,
    }))

    if (order.totals.shipping > 0) {
      lineItems.push({
        price_data: {
          currency: "czk",
          product_data: { name: "Doprava" },
          unit_amount: toStripeAmount(order.totals.shipping),
        },
        quantity: 1,
      })
    }

    if (order.totals.paymentSurcharge > 0) {
      lineItems.push({
        price_data: {
          currency: "czk",
          product_data: { name: "Příplatek za platbu" },
          unit_amount: toStripeAmount(order.totals.paymentSurcharge),
        },
        quantity: 1,
      })
    }

    // Discount as a one-off Stripe coupon so the charged amount equals
    // order.totals.total exactly (no per-line rounding drift).
    const totalDiscount = order.discount?.totalDiscount || 0
    const discounts: { coupon: string }[] = []
    if (totalDiscount > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: toStripeAmount(totalDiscount),
        currency: "czk",
        duration: "once",
        name: `Sleva ${order.discount?.code || ""}`.trim(),
      })
      discounts.push({ coupon: coupon.id })
    }

    const baseUrl = frontendBase()
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      ...(discounts.length ? { discounts } : {}),
      customer_email: order.customerInfo?.email || undefined,
      client_reference_id: orderId,
      metadata: { orderId },
      // Stripe minimum is 30 minutes; unpaid sessions expire so stock isn't
      // held forever (see webhook for the paid path).
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${baseUrl}/order-confirmation?orderId=${encodeURIComponent(orderId)}&t=${encodeURIComponent(orderAccessToken(orderId))}`,
      cancel_url: `${baseUrl}/checkout?payment=cancelled`,
    })

    order.stripeSessionId = session.id
    await order.save()

    res.json({ url: session.url })
  } catch (error) {
    console.error("Stripe checkout error:", error)
    res.status(500).json({ error: "Failed to create checkout session" })
  }
})

export default router
