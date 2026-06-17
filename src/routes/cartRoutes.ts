import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { CartModel } from "../models/Cart";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const cartId = uuidv4();
    const newCart = new CartModel({ cartId, items: [] });
    await newCart.save();

    // cartId se klientovi vrací v těle odpovědi; FE si ho drží v localStorage
    // a posílá v URL. Cookie tu nikdo nečetl, proto ji nenastavujeme.
    res.json({ cartId });
  } catch (err) {
    console.error(err);
  }
});

router.get("/:cartId", async (req, res) => {
  try {
    const { cartId } = req.params;
    const cart = await CartModel.findOne({ cartId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    res.json(cart);
  } catch (err) {
    console.error(err)
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
  }
});

router.put("/:cartId/items", async (req, res) => {
  try {
    const { cartId } = req.params;
    const { items } = req.body;

    let cart = await CartModel.findOne({ cartId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    // Replace all items with the new items array
    cart.items = items || [];

    await cart.save();
    res.json(cart);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update cart items" });
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
  }
});

router.delete("/:cartId", async (req, res) => {
  try {
    const { cartId } = req.params;
    await CartModel.deleteOne({ cartId });
    res.json({ message: "Cart deleted" });
  } catch (err) {
    console.error(err);
  }
});

export default router;
