import express, { Request, Response } from 'express'
import Steamer from '../models/Steamer'
import { apiKeyAuth } from '../middleware/apikeyAuth'

const router = express.Router()

router.get('/', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const steamers = await Steamer.find({ isDeleted: { $ne: true } })
    res.json(steamers)
  } catch (error) {
    res.status(500).json({ message: 'Chyba při načítání steamerů' })
  }
})

router.get('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const steamer = await Steamer.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
    if (!steamer) {
      return res.status(404).json({ message: 'Steamer nenalezen' })
    }
    res.json(steamer)
  } catch (error) {
    res.status(500).json({ message: 'Chyba při načítání steameru' })
  }
})

router.post('/', apiKeyAuth, async (req: Request, res: Response) => {
  const {
    name,
    shortDescription,
    description,
    price,
    weight,
    inStock,
    stockCount,
    imageUrl,
    videoUrl,
    category,
    storageMethod,
    ingredients,
  } = req.body

  try {
    const newSteamer = new Steamer({
      name,
      shortDescription,
      description,
      price,
      weight,
      inStock,
      stockCount,
      imageUrl,
      videoUrl,
      category,
      storageMethod,
      ingredients,
    })

    const savedSteamer = await newSteamer.save()
    res.status(201).json(savedSteamer)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při vytváření steameru', error: err })
  }
})

router.put('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const updatedSteamer = await Steamer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
    if (!updatedSteamer) {
      return res.status(404).json({ message: 'Steamer nenalezen' })
    }
    res.json(updatedSteamer)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při aktualizaci steameru', error: err })
  }
})

router.delete('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const deleted = await Steamer.findByIdAndDelete(req.params.id)
    if (!deleted) {
      return res.status(404).json({ message: 'Steamer nenalezen' })
    }
    res.json({ message: 'Steamer smazán' })
  } catch (err) {
    res.status(500).json({ message: 'Chyba při mazání steameru', error: err })
  }
})

router.patch('/:id/soft-delete', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const steamer = await Steamer.findById(req.params.id)

    if (!steamer || steamer.isDeleted) {
      return res.status(404).json({ message: 'Steamer nenalezen' })
    }

    steamer.isDeleted = true
    await steamer.save()

    res.json({ message: 'Steamer byl soft smazán' })
  } catch (error) {
    res.status(500).json({ message: 'Chyba při soft mazání steameru' })
  }
})

router.patch('/:id/undelete', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const steamer = await Steamer.findById(req.params.id)

    if (!steamer || !steamer.isDeleted) {
      return res.status(404).json({ message: 'Steamer nenalezen nebo není smazán' })
    }

    steamer.isDeleted = false
    await steamer.save()

    res.json({ message: 'Steamer byl obnoven (undelete)', steamer })
  } catch (error) {
    res.status(500).json({ message: 'Chyba při obnově steameru', error })
  }
})

// POST add batch to steamer (creates new batch in last LOT, new LOT every 10 batches)
router.post('/:id/add-batch', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { stockCount } = req.body

    if (stockCount === undefined || stockCount < 0) {
      return res.status(400).json({ message: 'stockCount is required and must be >= 0' })
    }

    const steamer = await Steamer.findById(req.params.id)
    if (!steamer || steamer.isDeleted) {
      return res.status(404).json({ message: 'Steamer nenalezen' })
    }

    const acronym = steamer.name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4)

    // Determine total batch count across all lots
    const totalBatches = steamer.lots.reduce((sum, lot) => sum + lot.batches.length, 0)
    const newBatchNumber = totalBatches + 1
    const batchId = `${acronym}-${String(newBatchNumber).padStart(3, '0')}`

    const newBatch = {
      batchId,
      stockCount: parseInt(stockCount),
    }

    // Check if we need a new LOT (every 10 batches)
    const lastLot = steamer.lots[steamer.lots.length - 1]
    if (!lastLot || lastLot.batches.length >= 10) {
      const newLotNumber = steamer.lots.length + 1
      const lotNumber = `ST-${acronym}-${String(newLotNumber).padStart(3, '0')}`
      steamer.lots.push({ lotNumber, batches: [newBatch] } as any)
    } else {
      lastLot.batches.push(newBatch as any)
    }

    // Update overall stockCount
    steamer.stockCount = steamer.stockCount + parseInt(stockCount)
    steamer.inStock = steamer.stockCount > 0

    await steamer.save()
    res.status(201).json(steamer)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při přidávání šarže', error: err })
  }
})

export default router
