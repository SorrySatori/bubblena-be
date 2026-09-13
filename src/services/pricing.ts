import Bomb from "../models/Bomb"
import Steamer from "../models/Steamer"
import DamagedProduct from "../models/DamagedProduct"

/** Error carrying an HTTP status so route handlers can map it 1:1. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = "HttpError"
  }
}

export const roundMoney = (amount: number) => Math.round(amount * 100) / 100

/** Server-side price list for shipping and payment. The client never sets these. */
export const SHIPPING_PRICES: Record<string, number> = {
  zasilkovna: 99,
  gls: 99,
}

export const PAYMENT_SURCHARGE: Record<string, number> = {
  card: 0,
  "bank-transfer": 0,
}

export interface PricedLine {
  id: string
  name: string
  unitPrice: number
  quantity: number
  weight?: number
}

const toPositiveQuantity = (quantity: unknown) => {
  const parsed = Number(quantity)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 999 ? parsed : null
}

/**
 * Resolves every cart line to its CURRENT price in the database. Item ids follow
 * the storefront convention:
 *   `damaged-<id>`   → DamagedProduct
 *   `<bombId>-<w>`   → Bomb variant of weight <w> (price from `pricing`)
 *   `<steamerId>`    → Steamer
 * Client-supplied names and prices are ignored on purpose.
 */
export async function priceItems(
  items: unknown
): Promise<{ lines: PricedLine[]; subtotal: number }> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "Objednávka musí obsahovat alespoň jednu položku.")
  }
  if (items.length > 100) {
    throw new HttpError(400, "Příliš mnoho položek v objednávce.")
  }

  const lines: PricedLine[] = []

  for (const raw of items) {
    const id = typeof raw?.id === "string" ? raw.id.trim() : ""
    const quantity = toPositiveQuantity(raw?.quantity)
    if (!id || quantity === null) {
      throw new HttpError(400, "Invalid order item quantity")
    }

    if (id.startsWith("damaged-")) {
      const damaged = await DamagedProduct.findOne({
        _id: id.slice("damaged-".length),
        isDeleted: { $ne: true },
      })
      if (!damaged) throw new HttpError(404, `Produkt ${id} už není v nabídce.`)
      lines.push({
        id,
        name: `${damaged.bathBombType} (${damaged.weight}g) – poškozená`,
        unitPrice: damaged.price,
        quantity,
        weight: damaged.weight,
      })
      continue
    }

    if (id.includes("-")) {
      const [bombId, variantWeight] = id.split("-")
      const weight = Number(variantWeight)
      if (!bombId || !Number.isFinite(weight)) {
        throw new HttpError(400, `Invalid product variant id ${id}`)
      }
      const bomb = await Bomb.findOne({ _id: bombId, isDeleted: { $ne: true } })
      const pricing = bomb?.pricing.find((p) => p.weight === weight)
      if (!bomb || !pricing) throw new HttpError(404, `Varianta ${id} už není v nabídce.`)
      lines.push({
        id,
        name: `${bomb.name} (${weight}g)`,
        unitPrice: pricing.price,
        quantity,
        weight,
      })
      continue
    }

    const steamer = await Steamer.findOne({ _id: id, isDeleted: { $ne: true } })
    if (!steamer) throw new HttpError(404, `Produkt ${id} už není v nabídce.`)
    lines.push({
      id,
      name: `${steamer.name} (${steamer.weight}g)`,
      unitPrice: steamer.price,
      quantity,
      weight: steamer.weight,
    })
  }

  const subtotal = roundMoney(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0))
  return { lines, subtotal }
}
