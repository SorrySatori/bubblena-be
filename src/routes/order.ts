import express from "express"
import { OrderModel } from "../models/Order"
import Product from "../models/Product"
import Steamer from "../models/Steamer"
import DamagedProduct from "../models/DamagedProduct"
import { DiscountCodeModel, IDiscountCode } from "../models/DiscountCode"
import { calculateDiscount, findValidDiscountCode } from "./discountCodeRoutes"

const router = express.Router();

type StockItem = {
  id: string
  quantity: number
}

const toPositiveQuantity = (quantity: unknown) => {
  const parsed = Number(quantity)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const roundMoney = (amount: number) => Math.round(amount * 100) / 100

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
    const [productId, variantWeight] = item.id.split("-")
    const weight = Number(variantWeight)

    if (!productId || !Number.isFinite(weight)) {
      throw new Error(`Invalid product variant id ${item.id}`)
    }

    const product = await Product.findOneAndUpdate(
      {
        _id: productId,
        isDeleted: { $ne: true },
        variants: { $elemMatch: { weight, stockCount: { $gte: item.quantity } } },
      },
      { $inc: { "variants.$.stockCount": -item.quantity } },
      { new: true }
    )

    if (!product || !Array.isArray(product.variants)) {
      throw new Error(`Insufficient stock for product variant ${item.id}`)
    }

    const variant = product.variants.find((variant: any) => variant.weight === weight)
    if (variant) {
      variant.inStock = variant.stockCount > 0
      await product.save()
    }

    return
  }

  const updated = await Steamer.findOneAndUpdate(
    {
      _id: item.id,
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
    throw new Error(`Insufficient stock for steamer ${item.id}`)
  }
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
    const [productId, variantWeight] = item.id.split("-")
    const weight = Number(variantWeight)

    if (!productId || !Number.isFinite(weight)) return

    await Product.findOneAndUpdate(
      { _id: productId, "variants.weight": weight },
      {
        $inc: { "variants.$.stockCount": item.quantity },
        $set: { "variants.$.inStock": true },
      }
    )
    return
  }

  await Steamer.findByIdAndUpdate(item.id, {
    $inc: { stockCount: item.quantity },
    $set: { inStock: true },
  })
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
    
    const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled"]
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" })
    }
    
    const order = await OrderModel.findOneAndUpdate(
      { orderId },
      { status, updatedAt: new Date() },
      { new: true }
    )
    
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" })
    }
    
    res.status(200).json({ success: true, order })
  } catch (error: any) {
    console.error("Error updating order status:", error)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
})

router.post("/create", async (req, res) => {
  try {
    const {
      orderId,
      customerInfo,
      weight,
      cartId,
      userId,
      items,
      shippingMethod,
      paymentMethod,
      totals,
      discount,
      selectedPickupPoint,
    } = req.body
    if (!orderId) {
      return res.status(400).json({ error: "Missing required fields." })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Order must contain at least one item." })
    }

    const existingOrder = await OrderModel.findOne({ orderId })
    if (existingOrder) {
      return res.status(200).json({ success: true, order: existingOrder })
    }

    const orderDiscount = await getOrderDiscount(discount, totals)
    const subtotal = roundMoney(Number(totals?.subtotal) || 0)
    const shipping = roundMoney(Number(totals?.shipping) || 0)
    const paymentSurcharge = roundMoney(Number(totals?.paymentSurcharge) || 0)
    const totalDiscount = orderDiscount?.discount.totalDiscount || 0
    const normalizedTotals = {
      subtotal,
      shipping,
      paymentSurcharge,
      total: Math.max(0, roundMoney(subtotal + shipping + paymentSurcharge - totalDiscount)),
    }

    const newOrder = await OrderModel.create({
    orderId,
      customerInfo,
      items,
      shippingMethod,
      paymentMethod,
      weight,
      totals: normalizedTotals,
      discount: orderDiscount?.discount,
      cartId,
      userId: userId || null,
      selectedPickupPoint,
      status: "pending",
    })
    const savedOrder = await newOrder.save()

    let markedDiscountCodeId: string | null = null
    try {
      markedDiscountCodeId = orderDiscount
        ? await markIndividualDiscountCodeUsed(orderDiscount.discountCode, orderId)
        : null
      await reduceStockForOrder(items)
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
  } catch (error: any) {
    console.error("Error creating order:", error)
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
