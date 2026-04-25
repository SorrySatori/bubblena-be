import express from "express"
import { OrderModel } from "../models/Order"
import Product from "../models/Product"
import Steamer from "../models/Steamer"
import DamagedProduct from "../models/DamagedProduct"

const router = express.Router();

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
      items,
      shippingMethod,
      paymentMethod,
      totals,
      selectedPickupPoint,
    } = req.body
    if (!orderId) {
      return res.status(400).json({ error: "Missing required fields." })
    }

    const newOrder = await OrderModel.create({
    orderId,
      customerInfo,
      items,
      shippingMethod,
      paymentMethod,
      weight,
      totals,
      cartId,
      selectedPickupPoint,
      status: "pending",
    })
    const savedOrder = await newOrder.save()

    // Reduce stock for each ordered item
    for (const item of items) {
      try {
        if (item.id.startsWith('damaged-')) {
          // Damaged product: id format is "damaged-{_id}"
          const damagedId = item.id.replace('damaged-', '')
          await DamagedProduct.findByIdAndUpdate(damagedId, {
            $inc: { stockCount: -item.quantity },
          })
          // Update inStock flag if needed
          const updated = await DamagedProduct.findById(damagedId)
          if (updated && updated.stockCount <= 0) {
            updated.inStock = false
            await updated.save()
          }
        } else if (item.id.includes('-')) {
          // Bath bomb: id format is "{productId}-{variantWeight}"
          const [productId, variantWeight] = item.id.split('-')
          const product = await Product.findById(productId)
          if (product && product.variants) {
            const variants = product.variants as any[]
            const variant = variants.find((v: any) => v.weight === parseFloat(variantWeight))
            if (variant) {
              variant.stockCount = Math.max(0, variant.stockCount - item.quantity)
              variant.inStock = variant.stockCount > 0
              await product.save()
            }
          }
        } else {
          // Steamer: id is the steamer _id
          await Steamer.findByIdAndUpdate(item.id, {
            $inc: { stockCount: -item.quantity },
          })
          const updated = await Steamer.findById(item.id)
          if (updated && updated.stockCount <= 0) {
            updated.inStock = false
            await updated.save()
          }
        }
      } catch (err) {
        console.error(`Error reducing stock for item ${item.id}:`, err)
      }
    }

    res.status(201).json({ success: true, order: savedOrder })
  } catch (error: any) {
    console.error("Error creating order:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
