import express from "express"
import type Stripe from "stripe"
import { stripe } from "../config/stripe"
import { OrderModel } from "../models/Order"
import { sendOrderConfirmation } from "../utils/orderEmails"
import { createShipmentForOrder } from "../services/shipping"

const router = express.Router()

/**
 * POST /api/stripe/webhook
 *
 * Mounted with express.raw() in index.ts (signature is computed over the raw
 * body). This is the ONLY place a card order becomes "paid"; the storefront
 * never decides that. On payment we trigger the confirmation e-mail + invoice
 * server-to-server.
 */
router.post("/", async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET není nastaven")
    return res.status(503).send("webhook not configured")
  }

  const signature = req.header("stripe-signature")
  if (!signature) return res.status(400).send("missing signature")

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, secret)
  } catch (err: any) {
    console.warn("Stripe webhook: neplatný podpis", err?.message)
    return res.status(400).send("bad signature")
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.client_reference_id || session.metadata?.orderId

      if (session.payment_status === "paid" && orderId) {
        // Atomic pending → paid transition; a redelivered event finds nothing to update.
        const order = await OrderModel.findOneAndUpdate(
          { orderId, status: "pending" },
          { $set: { status: "paid", paidAt: new Date(), stripeSessionId: session.id } },
          { new: true }
        )
        if (order) {
          sendOrderConfirmation(order).catch((err) =>
            console.error(`Failed to send confirmation for order ${orderId}:`, err?.message || err)
          )
          createShipmentForOrder(orderId).catch((err) =>
            console.error(`Failed to create shipment for order ${orderId}:`, err?.message || err)
          )
        } else {
          const existing = await OrderModel.findOne({ orderId }, { status: 1 })
          if (existing?.status === "cancelled") {
            // Should not happen (sessions expire after 30 min, cleanup after 60),
            // but if it does the customer paid for a cancelled order → refund manually.
            console.error(`PAYMENT RECEIVED FOR CANCELLED ORDER ${orderId} (session ${session.id}) – refund needed`)
          }
        }
      }
    }
  } catch (err) {
    // Log but still 2xx: Stripe would otherwise retry an event we can't process.
    console.error("Stripe webhook handling error:", err)
  }

  res.json({ received: true })
})

export default router
