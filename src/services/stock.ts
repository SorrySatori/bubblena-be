import Bomb from "../models/Bomb"
import Steamer from "../models/Steamer"
import DamagedProduct from "../models/DamagedProduct"

// Stock draw-down / restore for the three product families. Moved out of the
// order router so the cancellation/cleanup service can restore stock too.

export type StockItem = {
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

export const restoreStockForItem = async (item: StockItem) => {
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

export const reduceStockForOrder = async (items: StockItem[]) => {
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

/** Give back every item of an order (used by cancellation and payment-timeout cleanup). */
export const restoreStockForOrder = async (items: StockItem[]) => {
  for (const item of mergeStockItems(items)) {
    try {
      await restoreStockForItem(item)
    } catch (err: any) {
      console.error(`Failed to restore stock for ${item.id}:`, err?.message || err)
    }
  }
}
