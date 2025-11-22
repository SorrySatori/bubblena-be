import express from "express"
import { OrderModel } from "../models/Order"

const router = express.Router();

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

    res.status(201).json({ success: true, order: savedOrder })
  } catch (error: any) {
    console.error("Error creating order:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
