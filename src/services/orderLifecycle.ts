import { OrderModel } from "../models/Order"
import { DiscountCodeModel } from "../models/DiscountCode"
import { stripe } from "../config/stripe"
import { restoreStockForOrder } from "./stock"

/** Statuses from which a cancellation must give stock and discount codes back. */
const RESTOCK_ON_CANCEL = ["pending", "paid", "processing"]

/**
 * Cancel an order and undo its side effects: restore stock, release an
 * individual discount code, expire the Stripe session. Atomic on status, so
 * a concurrent webhook (pending → paid) and a cancellation can't both win.
 * Returns false when the order was not in a cancellable state.
 */
export async function cancelOrder(
  orderId: string,
  reason: string,
  allowedFrom: string[] = RESTOCK_ON_CANCEL
): Promise<boolean> {
  const order = await OrderModel.findOneAndUpdate(
    { orderId, status: { $in: allowedFrom } },
    { $set: { status: "cancelled", cancelledAt: new Date(), cancelReason: reason } },
    { new: true }
  )
  if (!order) return false

  await restoreStockForOrder(order.items)

  await DiscountCodeModel.updateOne(
    { usedByOrderId: orderId },
    { $unset: { usedAt: "", usedByOrderId: "" } }
  )

  if (order.stripeSessionId) {
    try {
      await stripe.checkout.sessions.expire(order.stripeSessionId)
    } catch {
      // Already expired or completed – nothing to do.
    }
  }

  return true
}

/** Card orders older than this without a payment are considered abandoned. */
export const PAYMENT_TIMEOUT_MS = 60 * 60 * 1000

/**
 * Cancel abandoned card orders. Stripe sessions expire after 30 minutes
 * (checkout.ts), so after 60 minutes a "pending" card order can no longer be
 * paid and is only blocking stock and discount codes.
 */
export async function cancelStaleCardOrders(): Promise<string[]> {
  const cutoff = new Date(Date.now() - PAYMENT_TIMEOUT_MS)
  const stale = await OrderModel.find(
    { paymentMethod: "card", status: "pending", createdAt: { $lt: cutoff } },
    { orderId: 1 }
  )

  const cancelled: string[] = []
  for (const { orderId } of stale) {
    try {
      // Only from "pending": if the webhook flipped it to "paid" meanwhile, leave it.
      if (await cancelOrder(orderId, "payment-timeout", ["pending"])) cancelled.push(orderId)
    } catch (err: any) {
      console.error(`Cleanup failed for order ${orderId}:`, err?.message || err)
    }
  }

  if (cancelled.length) console.log(`Cleanup: cancelled ${cancelled.length} unpaid card order(s)`)
  return cancelled
}

/**
 * In-process scheduler. Render's free tier may sleep the process, so an
 * external cron hitting POST /api/order/cleanup is the reliable complement.
 */
export function startOrderCleanupScheduler(intervalMs = 10 * 60 * 1000): void {
  const run = () =>
    cancelStaleCardOrders().catch((err) => console.error("Order cleanup error:", err?.message || err))

  setTimeout(run, 30 * 1000).unref()
  setInterval(run, intervalMs).unref()
}
