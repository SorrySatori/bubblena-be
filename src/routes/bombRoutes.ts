import express, { Request, Response } from 'express'
import Bomb from '../models/Bomb'
import { apiKeyAuth } from '../middleware/apikeyAuth'

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
