import express, { Request, Response } from 'express'
import mongoose from 'mongoose'
import Bomb from '../models/Bomb'
import { apiKeyAuth } from '../middleware/apikeyAuth'

/**
 * COMPATIBILITY LAYER – do not remove while bubblena-fe `main` is deployed.
 *
 * The preview storefront (bubblena-fe branch `main`) still consumes the flat
 * legacy "Product" shape from GET /api/products and /api/products/:id. The
 * data now lives in the `Bomb` model, so we map it here (same mapping as
 * bubblena-fe/server/utils/bombToProduct.ts on `dev`). Guarded by
 * test/contract.test.ts.
 */
const router = express.Router()

export function bombToLegacyProduct(bomb: any) {
  const stockByWeight: Record<number, number> = {}
  for (const lot of bomb.lots || []) {
    for (const batch of lot.batches || []) {
      for (const v of batch.variants || []) {
        stockByWeight[v.weight] = (stockByWeight[v.weight] || 0) + (v.stockCount || 0)
      }
    }
  }
  const variants = (bomb.pricing || []).map((p: any) => {
    const stockCount = stockByWeight[p.weight] || 0
    return { weight: p.weight, price: p.price, stockCount, inStock: stockCount > 0 }
  })
  return {
    _id: bomb._id,
    slug: bomb.slug,
    name: bomb.name,
    shortDescription: bomb.shortDescription,
    description: bomb.description,
    imageUrl: bomb.imageUrl,
    bathImageUrl: bomb.bathImageUrl,
    videoUrl: bomb.videoUrl,
    storageMethod: bomb.storageMethod,
    ingredients: bomb.ingredients ?? '',
    variants,
    isDeleted: bomb.isDeleted ?? false,
    createdAt: bomb.createdAt,
    updatedAt: bomb.updatedAt,
  }
}

router.get('/', apiKeyAuth, async (_req: Request, res: Response) => {
  try {
    const bombs = await Bomb.find({ isDeleted: { $ne: true } })
    res.json(bombs.map(bombToLegacyProduct))
  } catch (error) {
    console.error('legacy /products error:', error)
    res.status(500).json({ message: 'Chyba při načítání produktů' })
  }
})

router.get('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id)
    let bomb = null
    if (mongoose.Types.ObjectId.isValid(id)) {
      bomb = await Bomb.findOne({ _id: id, isDeleted: { $ne: true } })
    }
    if (!bomb) bomb = await Bomb.findOne({ slug: id, isDeleted: { $ne: true } })
    if (!bomb) return res.status(404).json({ message: 'Produkt nenalezen' })
    res.json(bombToLegacyProduct(bomb))
  } catch (error) {
    console.error('legacy /products/:id error:', error)
    res.status(500).json({ message: 'Chyba při načítání produktu' })
  }
})

export default router
