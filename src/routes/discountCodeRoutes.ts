import express, { Request, Response } from "express";
import { apiKeyAuth } from "../middleware/apikeyAuth";
import { DiscountCodeModel, IDiscountCode } from "../models/DiscountCode";

const router = express.Router();

const normalizeCode = (code: unknown) => String(code || "").trim().toUpperCase();
const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

const parseValidUntil = (validUntil: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return new Date(`${validUntil}T23:59:59.999`);
  }

  return new Date(validUntil);
};

export const calculateDiscount = (discountCode: IDiscountCode, subtotal: number, shipping: number) => {
  const percentageDiscount = discountCode.percentage > 0
    ? roundMoney(subtotal * (discountCode.percentage / 100))
    : 0;
  const shippingDiscount = discountCode.freeShipping ? roundMoney(shipping) : 0;

  return {
    code: discountCode.code,
    type: discountCode.type,
    percentage: discountCode.percentage,
    freeShipping: discountCode.freeShipping,
    percentageDiscount,
    shippingDiscount,
    totalDiscount: roundMoney(percentageDiscount + shippingDiscount),
  };
};

export const findValidDiscountCode = async (code: string) => {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return null;

  const discountCode = await DiscountCodeModel.findOne({
    code: normalizedCode,
    isActive: true,
  });

  if (!discountCode) return null;

  if (discountCode.type === "global" && (!discountCode.validUntil || discountCode.validUntil < new Date())) {
    return null;
  }

  if (discountCode.type === "individual" && discountCode.usedAt) {
    return null;
  }

  return discountCode;
};

router.get("/", apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const discountCodes = await DiscountCodeModel.find().sort({ createdAt: -1 });
    res.json({ success: true, discountCodes });
  } catch (error) {
    console.error("Error fetching discount codes:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/", apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { type, percentage = 0, freeShipping = false, validUntil } = req.body;
    const code = normalizeCode(req.body.code);

    if (!code || !["global", "individual"].includes(type)) {
      return res.status(400).json({ success: false, error: "Code and valid type are required" });
    }

    const parsedPercentage = Number(percentage);
    if (!Number.isFinite(parsedPercentage) || parsedPercentage < 0 || parsedPercentage > 100) {
      return res.status(400).json({ success: false, error: "Percentage must be between 0 and 100" });
    }

    if (type === "global" && !validUntil) {
      return res.status(400).json({ success: false, error: "Global discount code requires validUntil" });
    }

    if (parsedPercentage === 0 && !freeShipping) {
      return res.status(400).json({ success: false, error: "Discount code must have percentage discount or free shipping" });
    }

    const discountCode = await DiscountCodeModel.create({
      code,
      type,
      percentage: parsedPercentage,
      freeShipping: Boolean(freeShipping),
      validUntil: type === "global" ? parseValidUntil(validUntil) : validUntil ? parseValidUntil(validUntil) : undefined,
      isActive: true,
    });

    res.status(201).json({ success: true, discountCode });
  } catch (error: any) {
    console.error("Error creating discount code:", error);
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, error: "Discount code already exists" });
    }
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.patch("/:id", apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const update: Record<string, unknown> = {};

    if (typeof req.body.isActive === "boolean") update.isActive = req.body.isActive;
    if (req.body.percentage !== undefined) {
      const percentage = Number(req.body.percentage);
      if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
        return res.status(400).json({ success: false, error: "Percentage must be between 0 and 100" });
      }
      update.percentage = percentage;
    }
    if (typeof req.body.freeShipping === "boolean") update.freeShipping = req.body.freeShipping;
    if (req.body.validUntil) update.validUntil = parseValidUntil(req.body.validUntil);

    const discountCode = await DiscountCodeModel.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!discountCode) {
      return res.status(404).json({ success: false, error: "Discount code not found" });
    }

    res.json({ success: true, discountCode });
  } catch (error) {
    console.error("Error updating discount code:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/validate", apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const code = normalizeCode(req.body.code);
    const subtotal = Math.max(0, Number(req.body.subtotal) || 0);
    const shipping = Math.max(0, Number(req.body.shipping) || 0);
    const discountCode = await findValidDiscountCode(code);

    if (!discountCode) {
      return res.status(404).json({ success: false, error: "Discount code is invalid or expired" });
    }

    res.json({
      success: true,
      discount: calculateDiscount(discountCode, subtotal, shipping),
    });
  } catch (error) {
    console.error("Error validating discount code:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
