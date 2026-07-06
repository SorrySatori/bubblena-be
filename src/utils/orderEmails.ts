import axios from "axios"
import type { Order } from "../models/Order"

// Notifies the customer that their order has shipped by calling the
// bubblena-fe Nuxt endpoint (which owns the SMTP/nodemailer setup).
// Fire-and-forget: callers should not await this in a way that blocks
// or fails the status update if the e-mail can't be sent.
export async function sendOrderShippedEmail(order: Order): Promise<void> {
  const baseUrl = process.env.FRONTEND_URL || "https://bubblena.cz"

  await axios.post(
    `${baseUrl.replace(/\/$/, "")}/api/order-shipped`,
    {
      orderId: order.orderId,
      customerInfo: order.customerInfo,
      items: order.items,
      totals: order.totals,
      shippingMethod: order.shippingMethod,
      selectedPickupPoint: order.selectedPickupPoint,
    },
    {
      timeout: 15000,
      auth: {
        username: process.env.FE_BASIC_USER || "",
        password: process.env.FE_BASIC_PASS || "",
      },
    }
  )
}
