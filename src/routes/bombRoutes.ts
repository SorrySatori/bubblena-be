import express, { Request, Response } from 'express'
import mongoose from 'mongoose'
import Bomb from '../models/Bomb'
import { pick } from '../utils/pick'
import { apiKeyAuth } from '../middleware/apikeyAuth'
import { appendBatch } from '../utils/batching'

const router = express.Router()

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
    const id = String(req.params.id)
    let bomb = null
    if (mongoose.Types.ObjectId.isValid(id)) {
      bomb = await Bomb.findOne({ _id: id, isDeleted: { $ne: true } })
    }
    if (!bomb) {
      bomb = await Bomb.findOne({ slug: id, isDeleted: { $ne: true } })
    }
    if (!bomb) {
      return res.status(404).json({ message: 'Bomba nenalezena' })
    }
    res.json(bomb)
  } catch (error) {
    res.status(500).json({ message: 'Chyba při načítání bomby' })
  }
})

// Fields an admin may set. Never: _id, slug (derived), isDeleted, timestamps, __v.
const BOMB_FIELDS = [
  'name', 'acronym', 'shortDescription', 'description', 'pricing', 'lots',
  'imageUrl', 'bathImageUrl', 'videoUrl', 'storageMethod', 'ingredients',
] as const

// POST
router.post('/', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const newBomb = new Bomb(pick(req.body, BOMB_FIELDS))
    const savedBomb = await newBomb.save()
    res.status(201).json(savedBomb)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při vytváření bomby', error: err })
  }
})

// PUT
router.put('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const update = pick(req.body, BOMB_FIELDS)
    // Bump the version so a concurrent order save() (optimistic concurrency)
    // notices the stock changed under it.
    const updatedBomb = await Bomb.findByIdAndUpdate(
      req.params.id,
      { $set: update, $inc: { __v: 1 } },
      { new: true, runValidators: true }
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
