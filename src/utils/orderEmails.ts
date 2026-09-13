import axios from "axios"
import { OrderModel, type Order } from "../models/Order"

// The bubblena-fe Nuxt app owns SMTP/nodemailer and the Fakturoid integration.
// We call its internal endpoints server-to-server, authenticated with a shared
// secret (INTERNAL_TOKEN here, NUXT_INTERNAL_TOKEN on the Nuxt side). Only the
// orderId travels; Nuxt fetches the order back from this API.

const frontendBase = () => (process.env.FRONTEND_URL || "https://bubblena.cz").replace(/\/$/, "")

function internalHeaders() {
  const token = process.env.INTERNAL_TOKEN
  if (!token) throw new Error("INTERNAL_TOKEN není nastaven")
  return { "x-internal-token": token }
}

/** "Your order is on its way" e-mail. Fire-and-forget from the status PATCH. */
export async function sendOrderShippedEmail(order: Order): Promise<void> {
  await axios.post(
    `${frontendBase()}/api/order-shipped`,
    { orderId: order.orderId },
    { timeout: 15000, headers: internalHeaders() }
  )
}

/**
 * Confirmation e-mails + Fakturoid invoice. Idempotent: the order is claimed
 * (confirmationSentAt) before the call, so a redelivered webhook or a retry
 * never sends twice. On failure the claim is released so it can be retried.
 */
export async function sendOrderConfirmation(order: Order): Promise<void> {
  const claimed = await OrderModel.findOneAndUpdate(
    { orderId: order.orderId, confirmationSentAt: null },
    { $set: { confirmationSentAt: new Date() } }
  )
  if (!claimed) return

  try {
    // Fakturoid + PDF polling + 3 e-mails can take a while.
    await axios.post(
      `${frontendBase()}/api/order-confirmation`,
      { orderId: order.orderId },
      { timeout: 60000, headers: internalHeaders() }
    )
  } catch (err) {
    await OrderModel.updateOne({ orderId: order.orderId }, { $set: { confirmationSentAt: null } })
    throw err
  }
}
