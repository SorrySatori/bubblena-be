import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { CartModel, type CartItem } from "../models/Cart";

/**
 * COMPATIBILITY LAYER – used by bubblena-fe `main` (preview). See models/Cart.ts.
 * Mounted behind apiKeyAuth in src/app.ts. Guarded by test/contract.test.ts.
 */
const router = Router();

const MAX_ITEMS = 100;

const sanitizeItems = (raw: unknown): CartItem[] =>
  (Array.isArray(raw) ? raw : [])
    .slice(0, MAX_ITEMS)
    .map((i: any) => ({
      productId: String(i?.productId ?? "").slice(0, 100),
      variantId: typeof i?.variantId === "number" ? i.variantId : i?.variantId ? String(i.variantId).slice(0, 50) : undefined,
      quantity: Number.isInteger(Number(i?.quantity)) ? Math.min(999, Math.max(1, Number(i.quantity))) : 1,
    }))
    .filter((i) => i.productId);

router.post("/", async (_req, res) => {
  try {
    const cart = await CartModel.create({ cartId: uuidv4(), items: [] });
    res.json({ cartId: cart.cartId });
  } catch (err) {
    console.error("cart create error:", err);
    res.status(500).json({ message: "Failed to create cart" });
  }
});

router.get("/:cartId", async (req, res) => {
  try {
    const cart = await CartModel.findOne({ cartId: req.params.cartId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });
    res.json(cart);
  } catch (err) {
    console.error("cart get error:", err);
    res.status(500).json({ message: "Failed to fetch cart" });
  }
});

router.post("/:cartId/add", async (req, res) => {
  try {
    const cart = await CartModel.findOne({ cartId: req.params.cartId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const [item] = sanitizeItems([req.body]);
    if (!item) return res.status(400).json({ message: "Invalid item" });

    const existing = cart.items.find(
      (i) => i.productId === item.productId && String(i.variantId ?? "") === String(item.variantId ?? "")
    );
    if (existing) existing.quantity = Math.min(999, existing.quantity + item.quantity);
    else cart.items.push(item);

    await cart.save();
    res.json(cart);
  } catch (err) {
    console.error("cart add error:", err);
    res.status(500).json({ message: "Failed to add item to cart" });
  }
});

router.put("/:cartId/items", async (req, res) => {
  try {
    const cart = await CartModel.findOne({ cartId: req.params.cartId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });
    cart.items = sanitizeItems(req.body?.items);
    await cart.save();
    res.json(cart);
  } catch (err) {
    console.error("cart update error:", err);
    res.status(500).json({ message: "Failed to update cart items" });
  }
});

router.post("/:cartId/remove", async (req, res) => {
  try {
    const cart = await CartModel.findOne({ cartId: req.params.cartId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });
    const { productId, variantId } = req.body || {};
    cart.items = cart.items.filter(
      (i) => !(i.productId === String(productId) && (!variantId || String(i.variantId ?? "") === String(variantId)))
    );
    await cart.save();
    res.json(cart);
  } catch (err) {
    console.error("cart remove error:", err);
    res.status(500).json({ message: "Failed to remove item" });
  }
});

router.delete("/:cartId", async (req, res) => {
  try {
    await CartModel.deleteOne({ cartId: req.params.cartId });
    res.json({ message: "Cart deleted" });
  } catch (err) {
    console.error("cart delete error:", err);
    res.status(500).json({ message: "Failed to delete cart" });
  }
});

export default router;
