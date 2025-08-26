import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { CartModel } from "../models/Cart";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const cartId = uuidv4();
    const newCart = new CartModel({ cartId, items: [] });
    await newCart.save();

    res.cookie("cartId", cartId, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dní
    });

    res.json({ cartId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create cart" });
  }
});

router.get("/:cartId", async (req, res) => {
  try {
    const { cartId } = req.params;
    const cart = await CartModel.findOne({ cartId });

    if (!cart) return res.status(404).json({ message: "Cart not found" });

    res.json(cart);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch cart" });
  }
});

router.post("/:cartId/add", async (req, res) => {
  try {
    const { cartId } = req.params;
    const { productId, variantId, quantity } = req.body;

    let cart = await CartModel.findOne({ cartId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const existingItem = cart.items.find(
      (item) =>
        item.productId.toString() === productId &&
        (!variantId || item.variantId?.toString() === variantId)
    );

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.items.push({ productId, variantId, quantity });
    }

    await cart.save();
    res.json(cart);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to add item" });
  }
});

router.post("/:cartId/remove", async (req, res) => {
  try {
    const { cartId } = req.params;
    const { productId, variantId } = req.body;

    const cart = await CartModel.findOne({ cartId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = cart.items.filter(
      (item) =>
        !(
          item.productId.toString() === productId &&
          (!variantId || item.variantId?.toString() === variantId)
        )
    );

    await cart.save();
    res.json(cart);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to remove item" });
  }
});

router.delete("/:cartId", async (req, res) => {
  try {
    const { cartId } = req.params;
    await CartModel.deleteOne({ cartId });
    res.json({ message: "Cart deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete cart" });
  }
});

export default router;
