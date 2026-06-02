import express, { Request, Response } from 'express'
import Bomb from '../models/Bomb'
import Product from '../models/Product'
import { apiKeyAuth } from '../middleware/apikeyAuth'
import { appendBatch } from '../utils/batching'

const router = express.Router()

// POST migrate products to bombs (one-time use)
router.post('/migrate-from-products', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const existingBombs = await Bomb.countDocuments()
    if (existingBombs > 0) {
      return res.status(400).json({ message: 'Bombs collection is not empty. Migration skipped to avoid duplicates.' })
    }

    const products = await Product.find({ isDeleted: { $ne: true } })

    const generateAcronym = (name: string): string => {
      return name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4)
    }

    const bombs = products.map((product) => ({
      name: product.name,
      acronym: generateAcronym(product.name),
      shortDescription: product.shortDescription || '',
      description: product.description || '',
      lots: [],
      storageMethod: product.storageMethod || '',
      imageUrl: product.imageUrl,
      videoUrl: product.videoUrl,
      bathImageUrl: product.bathImageUrl,
      isDeleted: false,
    }))

    const inserted = await Bomb.insertMany(bombs)
    res.status(201).json({ message: `Migrated ${inserted.length} products to bombs`, bombs: inserted })
  } catch (err) {
    res.status(500).json({ message: 'Migration failed', error: err })
  }
})

// GET all bombs
router.get('/', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const bombs = await Bomb.find({ isDeleted: { $ne: true } })
    res.json(bombs)
  } catch (error) {
    res.status(500).json({ message: 'Chyba při načítání bomb' })
  }
})

// GET single bomb by ID
router.get('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const bomb = await Bomb.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
    if (!bomb) {
      return res.status(404).json({ message: 'Bomba nenalezena' })
    }
    res.json(bomb)
  } catch (error) {
    res.status(500).json({ message: 'Chyba při načítání bomby' })
  }
})

// POST
router.post('/', apiKeyAuth, async (req: Request, res: Response) => {
  const {
    name,
    shortDescription,
    description,
    lots,
    imageUrl,
    storageMethod,
    bathImageUrl,
    videoUrl,
  } = req.body

  try {
    const newBomb = new Bomb({
      name,
      shortDescription,
      description,
      lots,
      imageUrl,
      storageMethod,
      bathImageUrl,
      videoUrl,
    })

    const savedBomb = await newBomb.save()
    res.status(201).json(savedBomb)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při vytváření bomby', error: err })
  }
})

// PUT
router.put('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const updatedBomb = await Bomb.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
    if (!updatedBomb) {
      return res.status(404).json({ message: 'Bomba nenalezena' })
    }
    res.json(updatedBomb)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při aktualizaci bomby', error: err })
  }
})

// POST add batch to bomb (creates new batch in last LOT, or new LOT every 10 batches)
router.post('/:id/add-batch', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { variants } = req.body

    if (!variants || !Array.isArray(variants) || variants.length === 0) {
      return res.status(400).json({ message: 'Variants array is required' })
    }

    const bomb = await Bomb.findById(req.params.id)
    if (!bomb || bomb.isDeleted) {
      return res.status(404).json({ message: 'Bomba nenalezena' })
    }

    const priceByWeight = new Map(bomb.pricing.map(p => [p.weight, p.price]))

    appendBatch(bomb, 'BB', bomb.acronym, (batchId) => ({
      batchId,
      variants: variants.map((v: { weight: number; stockCount: number }) => ({
        weight: v.weight,
        price: priceByWeight.get(v.weight) || 0,
        stockCount: v.stockCount,
        inStock: v.stockCount > 0,
      })),
    }))

    await bomb.save()
    res.status(201).json(bomb)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při přidávání šarže', error: err })
  }
})

// DELETE
router.delete('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const deleted = await Bomb.findByIdAndDelete(req.params.id)
    if (!deleted) {
      return res.status(404).json({ message: 'Bomba nenalezena' })
    }
    res.json({ message: 'Bomba smazána' })
  } catch (err) {
    res.status(500).json({ message: 'Chyba při mazání bomby', error: err })
  }
})

// SOFT DELETE
router.patch('/:id/soft-delete', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const bomb = await Bomb.findById(req.params.id)

    if (!bomb || bomb.isDeleted) {
      return res.status(404).json({ message: 'Bomba nenalezena' })
    }

    bomb.isDeleted = true
    await bomb.save()

    res.json({ message: 'Bomba byla soft smazána' })
  } catch (error) {
    res.status(500).json({ message: 'Chyba při soft mazání bomby' })
  }
})

// UNDELETE
router.patch('/:id/undelete', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const bomb = await Bomb.findById(req.params.id)

    if (!bomb || !bomb.isDeleted) {
      return res.status(404).json({ message: 'Bomba nenalezena nebo není smazána' })
    }

    bomb.isDeleted = false
    await bomb.save()

    res.json({ message: 'Bomba byla obnovena (undelete)', bomb })
  } catch (error) {
    res.status(500).json({ message: 'Chyba při obnově bomby', error })
  }
})

export default router
