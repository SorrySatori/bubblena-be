import express from "express"
import { OrderModel } from "../models/Order"
import Bomb from "../models/Bomb"
import Steamer from "../models/Steamer"
import DamagedProduct from "../models/DamagedProduct"
import { DiscountCodeModel, IDiscountCode } from "../models/DiscountCode"
import { calculateDiscount, findValidDiscountCode } from "./discountCodeRoutes"
import { sendOrderShippedEmail, sendOrderConfirmation } from "../utils/orderEmails"
import { HttpError, PAYMENT_SURCHARGE, SHIPPING_PRICES, priceItems, roundMoney } from "../services/pricing"

const router = express.Router();

type StockItem = {
  id: string
  quantity: number
}

const toPositiveQuantity = (quantity: unknown) => {
  const parsed = Number(quantity)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const mergeStockItems = (items: StockItem[]) => {
  const merged = new Map<string, StockItem>()

  for (const item of items) {
    const quantity = toPositiveQuantity(item.quantity)
    if (!item.id || quantity === null) {
      throw new Error("Invalid order item quantity")
    }

    const existing = merged.get(item.id)
    if (existing) {
      existing.quantity += quantity
    } else {
      merged.set(item.id, { id: item.id, quantity })
    }
  }

  return Array.from(merged.values())
}

const reduceStockForItem = async (item: StockItem) => {
  if (item.id.startsWith("damaged-")) {
    const damagedId = item.id.replace("damaged-", "")
    const updated = await DamagedProduct.findOneAndUpdate(
      {
        _id: damagedId,
        isDeleted: { $ne: true },
        stockCount: { $gte: item.quantity },
      },
      [
        {
          $set: {
            stockCount: { $subtract: ["$stockCount", item.quantity] },
            inStock: { $gt: [{ $subtract: ["$stockCount", item.quantity] }, 0] },
          },
        },
      ],
      { new: true }
    )

    if (!updated) {
      throw new Error(`Insufficient stock for damaged product ${damagedId}`)
    }

    return
  }

  if (item.id.includes("-")) {
    const [bombId, variantWeight] = item.id.split("-")
    const weight = Number(variantWeight)

    if (!bombId || !Number.isFinite(weight)) {
      throw new Error(`Invalid product variant id ${item.id}`)
    }

    // Bath bombs live in the Bomb model, with stock spread across
    // lots → batches → variants. Draw down `quantity` pieces of this weight
    // across batches, oldest first (FIFO).
    const bomb: any = await Bomb.findOne({ _id: bombId, isDeleted: { $ne: true } })
    if (!bomb) {
      throw new Error(`Insufficient stock for product variant ${item.id}`)
    }

    const available = (bomb.lots || []).reduce(
      (sum: number, lot: any) =>
        sum +
        (lot.batches || []).reduce(
          (bs: number, batch: any) =>
            bs +
            (batch.variants || []).reduce(
              (vs: number, v: any) => vs + (v.weight === weight ? v.stockCount || 0 : 0),
              0
            ),
          0
        ),
      0
    )

    if (available < item.quantity) {
      throw new Error(`Insufficient stock for product variant ${item.id}`)
    }

    let remaining = item.quantity
    for (const lot of bomb.lots || []) {
      for (const batch of lot.batches || []) {
        for (const v of batch.variants || []) {
          if (remaining <= 0) break
          if (v.weight !== weight) continue
          const take = Math.min(v.stockCount || 0, remaining)
          v.stockCount = (v.stockCount || 0) - take
          v.inStock = v.stockCount > 0
          remaining -= take
        }
      }
    }

    bomb.markModified("lots")
    await bomb.save()

    return
  }

  // Steamers also carry stock in lots → batches (single weight, so stock is at
  // batch level). Draw down `quantity` across batches oldest-first (FIFO) and
  // keep the top-level stockCount/inStock as the aggregate of the batches.
  const steamer: any = await Steamer.findOne({ _id: item.id, isDeleted: { $ne: true } })
  if (!steamer) {
    throw new Error(`Insufficient stock for steamer ${item.id}`)
  }

  const steamerAvailable = (steamer.lots || []).reduce(
    (sum: number, lot: any) =>
      sum + (lot.batches || []).reduce((bs: number, b: any) => bs + (b.stockCount || 0), 0),
    0
  )

  if (steamerAvailable < item.quantity) {
    throw new Error(`Insufficient stock for steamer ${item.id}`)
  }

  let steamerRemaining = item.quantity
  for (const lot of steamer.lots || []) {
    for (const b of lot.batches || []) {
      if (steamerRemaining <= 0) break
      const take = Math.min(b.stockCount || 0, steamerRemaining)
      b.stockCount = (b.stockCount || 0) - take
      steamerRemaining -= take
    }
  }

  steamer.stockCount = steamerAvailable - item.quantity
  steamer.inStock = steamer.stockCount > 0
  steamer.markModified("lots")
  await steamer.save()
}

const restoreStockForItem = async (item: StockItem) => {
  if (item.id.startsWith("damaged-")) {
    const damagedId = item.id.replace("damaged-", "")
    await DamagedProduct.findByIdAndUpdate(damagedId, {
      $inc: { stockCount: item.quantity },
      $set: { inStock: true },
    })
    return
  }

  if (item.id.includes("-")) {
    const [bombId, variantWeight] = item.id.split("-")
    const weight = Number(variantWeight)

    if (!bombId || !Number.isFinite(weight)) return

    // Undo a bomb draw-down: add the pieces back to the first batch that
    // carries this weight (restores the total; used only for create rollback).
    const bomb: any = await Bomb.findOne({ _id: bombId })
    if (!bomb) return

    let restored = false
    for (const lot of bomb.lots || []) {
      for (const batch of lot.batches || []) {
        for (const v of batch.variants || []) {
          if (v.weight === weight) {
            v.stockCount = (v.stockCount || 0) + item.quantity
            v.inStock = true
            restored = true
            break
          }
        }
        if (restored) break
      }
      if (restored) break
    }

    if (restored) {
      bomb.markModified("lots")
      await bomb.save()
    }
    return
  }

  // Undo a steamer draw-down: add back to the first batch (or the top-level
  // aggregate if the steamer has no batches yet). Used only for create rollback.
  const steamer: any = await Steamer.findOne({ _id: item.id })
  if (!steamer) return

  let steamerRestored = false
  for (const lot of steamer.lots || []) {
    for (const b of lot.batches || []) {
      b.stockCount = (b.stockCount || 0) + item.quantity
      steamerRestored = true
      break
    }
    if (steamerRestored) break
  }

  if (steamerRestored) {
    const steamerTotal = (steamer.lots || []).reduce(
      (sum: number, lot: any) =>
        sum + (lot.batches || []).reduce((bs: number, b: any) => bs + (b.stockCount || 0), 0),
      0
    )
    steamer.stockCount = steamerTotal
    steamer.markModified("lots")
  } else {
    steamer.stockCount = (steamer.stockCount || 0) + item.quantity
  }
  steamer.inStock = true
  await steamer.save()
}

const reduceStockForOrder = async (items: StockItem[]) => {
  const stockItems = mergeStockItems(items)
  const reducedItems: StockItem[] = []

  try {
    for (const item of stockItems) {
      await reduceStockForItem(item)
      reducedItems.push(item)
    }
  } catch (error) {
    for (const item of reducedItems.reverse()) {
      await restoreStockForItem(item)
    }
    throw error
  }
}

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

    const wasShipped = existing.status === "shipped"
    existing.status = status
    existing.updatedAt = new Date()
    const order = await existing.save()

    res.status(200).json({ success: true, order })

    // On transition into "shipped" (Odesláno), notify the customer by e-mail.
    // Fire-and-forget — never let an e-mail failure affect the status update.
    if (status === "shipped" && !wasShipped) {
      sendOrderShippedEmail(order).catch((err) =>
        console.error(`Failed to send shipped e-mail for order ${orderId}:`, err?.message || err)
      )
    }
  } catch (error: any) {
    console.error("Error updating order status:", error)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAYMENT_METHODS = Object.keys(PAYMENT_SURCHARGE)

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "")

/** Keep only the customer fields the schema knows; everything is coerced to string. */
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
      selectedPickupPoint,
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
