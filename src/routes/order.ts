import express from "express"
import { OrderModel } from "../models/Order"
import { DiscountCodeModel, IDiscountCode } from "../models/DiscountCode"
import { calculateDiscount, findValidDiscountCode } from "./discountCodeRoutes"
import { sendOrderShippedEmail, sendOrderConfirmation } from "../utils/orderEmails"
import { HttpError, PAYMENT_SURCHARGE, SHIPPING_PRICES, priceItems, roundMoney } from "../services/pricing"
import { reduceStockForOrder } from "../services/stock"
import { createShipmentForOrder } from "../services/shipping"
import { cancelOrder, cancelStaleCardOrders } from "../services/orderLifecycle"

const router = express.Router();

const getOrderDiscount = async (
  discount: { code?: string } | undefined,
  totals: { subtotal?: number; shipping?: number } | undefined
) => {
  const code = discount?.code?.trim()
  if (!code) return null

  const discountCode = await findValidDiscountCode(code)
  if (!discountCode) {
    throw new Error("Slevový kód není platný nebo již vypršel.")
  }

  return {
    discountCode,
    discount: calculateDiscount(
      discountCode,
      Math.max(0, Number(totals?.subtotal) || 0),
      Math.max(0, Number(totals?.shipping) || 0)
    ),
  }
}

const markIndividualDiscountCodeUsed = async (discountCode: IDiscountCode, orderId: string) => {
  if (discountCode.type !== "individual") return null

  const usedCode = await DiscountCodeModel.findOneAndUpdate(
    {
      _id: discountCode._id,
      usedAt: { $exists: false },
    },
    {
      $set: {
        usedAt: new Date(),
        usedByOrderId: orderId,
      },
    },
    { new: true }
  )

  if (!usedCode) {
    throw new Error("Slevový kód již byl použit.")
  }

  return String(usedCode._id)
}

// GET all orders
router.get("/", async (req, res) => {
  try {
    const orders = await OrderModel.find().sort({ createdAt: -1 })
    res.status(200).json({ success: true, orders })
  } catch (error: any) {
    console.error("Error fetching orders:", error)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
})

// GET single order by orderId
router.get("/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params
    const order = await OrderModel.findOne({ orderId })
    
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" })
    }
    
    res.status(200).json({ success: true, order })
  } catch (error: any) {
    console.error("Error fetching order:", error)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
})

// PATCH update order status
router.patch("/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params
    const { status } = req.body

    if (!status) {
      return res.status(400).json({ success: false, error: "Status is required" })
    }

    const validStatuses = ["pending", "paid", "processing", "shipped", "delivered", "cancelled"]
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" })
    }

    const existing = await OrderModel.findOne({ orderId })
    if (!existing) {
      return res.status(404).json({ success: false, error: "Order not found" })
    }

    const previous = existing.status

    if (status === "cancelled" && previous !== "cancelled") {
      // Cancelling an unfulfilled order gives stock + discount code back.
      // From shipped/delivered we only flip the status (goods already left).
      const restocked = await cancelOrder(orderId, "admin")
      if (!restocked) {
        existing.status = "cancelled"
        existing.cancelledAt = new Date()
        existing.cancelReason = "admin"
        await existing.save()
      }
    } else {
      existing.status = status
      if (status === "paid" && !existing.paidAt) existing.paidAt = new Date()
      await existing.save()
    }

    const order = await OrderModel.findOne({ orderId })
    res.status(200).json({ success: true, order })

    // Side effects run after the response; a failure never blocks the status change.
    if (status === "paid" && previous !== "paid") {
      // Bank transfer confirmed by the admin → confirmation was already sent at
      // creation; only the shipment is pending.
      createShipmentForOrder(orderId).catch((err) =>
        console.error(`Failed to create shipment for order ${orderId}:`, err?.message || err)
      )
    } else if (status === "processing" && previous !== "processing") {
      createShipmentForOrder(orderId).catch((err) =>
        console.error(`Failed to create shipment for order ${orderId}:`, err?.message || err)
      )
    }

    if (status === "shipped" && previous !== "shipped" && order) {
      sendOrderShippedEmail(order).catch((err) =>
        console.error(`Failed to send shipped e-mail for order ${orderId}:`, err?.message || err)
      )
    }
  } catch (error: any) {
    console.error("Error updating order status:", error)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
})

// POST create (or retry) the carrier shipment for a paid order – admin action.
router.post("/:orderId/shipment", async (req, res) => {
  try {
    const result = await createShipmentForOrder(req.params.orderId)
    const order = await OrderModel.findOne({ orderId: req.params.orderId })
    if (result.outcome === "created") return res.status(200).json({ success: true, order, ...result })
    if (result.outcome === "skipped") return res.status(409).json({ success: false, error: result.reason, order })
    return res.status(502).json({ success: false, error: result.error, order })
  } catch (error: any) {
    console.error("Error creating shipment:", error)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
})

// GET the carrier label PDF (GLS returns one; Packeta labels are printed in their portal).
router.get("/:orderId/shipment/label", async (req, res) => {
  try {
    const order = await OrderModel.findOne({ orderId: req.params.orderId }).select("+shipment.labelBase64")
    const label = order?.shipment?.labelBase64
    if (!order || !label) {
      return res.status(404).json({ success: false, error: "Štítek není k dispozici" })
    }
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `inline; filename="stitek-${order.orderId}.pdf"`)
    res.send(Buffer.from(label, "base64"))
  } catch (error: any) {
    console.error("Error fetching label:", error)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
})

// POST cancel abandoned card orders (for an external cron; also runs in-process).
router.post("/cleanup", async (_req, res) => {
  try {
    const cancelled = await cancelStaleCardOrders()
    res.status(200).json({ success: true, cancelled })
  } catch (error: any) {
    console.error("Error running order cleanup:", error)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAYMENT_METHODS = Object.keys(PAYMENT_SURCHARGE)

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "")

/** Keep only the customer fields the schema knows; everything is coerced to string. */
/**
 * Normalize the pickup point from either widget. Packeta v6 sends
 * { id, name, street, city, zip, country, ... }; the GLS map sends
 * { pclshopid, name, address, city, zipcode, ctrcode, ... }.
 */
const sanitizePickupPoint = (raw: any) => {
  if (!raw || typeof raw !== "object") return null
  const id = str(raw.id ?? raw.pclshopid, 100)
  if (!id) return null
  return {
    id,
    name: str(raw.name, 200),
    street: str(raw.street ?? raw.address, 200),
    houseNumber: str(raw.houseNumber, 20),
    zip: str(raw.zip ?? raw.zipcode, 20),
    city: str(raw.city, 100),
    country: str(raw.country ?? raw.ctrcode, 10) || "CZ",
    url: str(raw.url, 500),
    place: str(raw.place, 200),
    branchCode: str(raw.branchCode, 50),
    routingCode: str(raw.routingCode, 50),
    routingName: str(raw.routingName, 100),
  }
}

const sanitizeCustomerInfo = (raw: any) => ({
  firstName: str(raw?.firstName, 100),
  lastName: str(raw?.lastName, 100),
  email: str(raw?.email, 254).toLowerCase(),
  phone: str(raw?.phone, 40),
  address: {
    street: str(raw?.address?.street),
    city: str(raw?.address?.city, 100),
    postalCode: str(raw?.address?.postalCode, 20),
    country: str(raw?.address?.country, 60),
  },
  billingAddressSameAsShipping: raw?.billingAddressSameAsShipping !== false,
})

router.post("/create", async (req, res) => {
  try {
    const {
      orderId,
      customerInfo: rawCustomerInfo,
      cartId,
      userId,
      items,
      shippingMethod,
      paymentMethod,
      totals: clientTotals,
      discount,
      selectedPickupPoint: rawPickupPoint,
      orderNotes,
    } = req.body || {}

    if (typeof orderId !== "string" || !UUID_RE.test(orderId)) {
      return res.status(400).json({ error: "Missing required fields." })
    }
    if (typeof shippingMethod !== "string" || !(shippingMethod in SHIPPING_PRICES)) {
      return res.status(400).json({ error: "Neplatný způsob dopravy." })
    }
    if (typeof paymentMethod !== "string" || !PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: "Neplatný způsob platby." })
    }

    // Both carriers deliver to a pickup point; without one no shipment can be made.
    const selectedPickupPoint = sanitizePickupPoint(rawPickupPoint)
    if (!selectedPickupPoint) {
      return res.status(400).json({ error: "Vyberte prosím výdejní místo." })
    }

    const customerInfo = sanitizeCustomerInfo(rawCustomerInfo)
    if (
      !customerInfo.firstName || !customerInfo.lastName || !customerInfo.email ||
      !customerInfo.phone || !customerInfo.address.street || !customerInfo.address.city ||
      !customerInfo.address.postalCode
    ) {
      return res.status(400).json({ error: "Chybí kontaktní údaje zákazníka." })
    }

    const existingOrder = await OrderModel.findOne({ orderId })
    if (existingOrder) {
      return res.status(200).json({ success: true, order: existingOrder })
    }

    // Prices come from the database, never from the request body.
    const priced = await priceItems(items)
    const shipping = SHIPPING_PRICES[shippingMethod]
    const paymentSurcharge = PAYMENT_SURCHARGE[paymentMethod]

    const orderDiscount = await getOrderDiscount(discount, { subtotal: priced.subtotal, shipping })
    const totalDiscount = orderDiscount?.discount.totalDiscount || 0
    const normalizedTotals = {
      subtotal: priced.subtotal,
      shipping,
      paymentSurcharge,
      total: Math.max(0, roundMoney(priced.subtotal + shipping + paymentSurcharge - totalDiscount)),
    }

    // The customer saw a total in the checkout; if it no longer matches (price
    // change, stale cart), refuse rather than charge something they didn't see.
    const clientTotal = Number(clientTotals?.total)
    if (Number.isFinite(clientTotal) && Math.abs(clientTotal - normalizedTotals.total) > 0.01) {
      return res.status(409).json({
        error: "Ceny v košíku se změnily. Obnovte prosím stránku a zkontrolujte objednávku.",
      })
    }

    const clientImageById = new Map<string, string>(
      (Array.isArray(items) ? items : [])
        .filter((i: any) => typeof i?.id === "string" && typeof i?.imageUrl === "string")
        .map((i: any) => [i.id, i.imageUrl])
    )
    const orderItems = priced.lines.map((line) => ({
      id: line.id,
      name: line.name,
      price: line.unitPrice,
      quantity: line.quantity,
      variant: line.weight ? { weight: line.weight } : undefined,
      imageUrl: clientImageById.get(line.id),
    }))

    const newOrder = await OrderModel.create({
      orderId,
      customerInfo,
      items: orderItems,
      shippingMethod,
      paymentMethod,
      totals: normalizedTotals,
      discount: orderDiscount?.discount,
      cartId: str(cartId, 100) || null,
      userId: str(userId, 100) || null,
      selectedPickupPoint,
      orderNotes: str(orderNotes, 1000),
      status: "pending",
    })
    const savedOrder = await newOrder.save()

    let markedDiscountCodeId: string | null = null
    try {
      markedDiscountCodeId = orderDiscount
        ? await markIndividualDiscountCodeUsed(orderDiscount.discountCode, orderId)
        : null
      await reduceStockForOrder(orderItems)
    } catch (error) {
      await OrderModel.deleteOne({ orderId })

      if (markedDiscountCodeId) {
        await DiscountCodeModel.findByIdAndUpdate(markedDiscountCodeId, {
          $unset: { usedAt: "", usedByOrderId: "" },
        })
      }

      throw error
    }

    res.status(201).json({ success: true, order: savedOrder })

    // Bank transfer: confirm right away (payment is verified manually later).
    // Card: the Stripe webhook confirms once the payment is actually captured.
    if (paymentMethod === "bank-transfer") {
      sendOrderConfirmation(savedOrder).catch((err) =>
        console.error(`Failed to send confirmation for order ${orderId}:`, err?.message || err)
      )
    }
  } catch (error: any) {
    console.error("Error creating order:", error)
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message })
    }
    if (error?.message?.startsWith("Insufficient stock")) {
      return res.status(409).json({ error: error.message })
    }

    if (error?.message === "Slevový kód není platný nebo již vypršel." || error?.message === "Slevový kód již byl použit.") {
      return res.status(409).json({ error: error.message })
    }

    if (error?.message === "Invalid order item quantity" || error?.message?.startsWith("Invalid product variant id")) {
      return res.status(400).json({ error: error.message })
    }

    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
