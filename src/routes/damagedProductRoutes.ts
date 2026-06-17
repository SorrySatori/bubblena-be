import express, { Request, Response } from 'express'
import mongoose from 'mongoose'
import DamagedProduct from '../models/DamagedProduct'
import { apiKeyAuth } from '../middleware/apikeyAuth'

const router = express.Router()

router.get('/', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const damagedProducts = await DamagedProduct.find({ isDeleted: { $ne: true } })
    res.json(damagedProducts)
  } catch (error) {
    res.status(500).json({ message: 'Chyba při načítání poškozených produktů' })
  }
})

router.get('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id)
    let damagedProduct = null
    if (mongoose.Types.ObjectId.isValid(id)) {
      damagedProduct = await DamagedProduct.findOne({ _id: id, isDeleted: { $ne: true } })
    }
    if (!damagedProduct) {
      damagedProduct = await DamagedProduct.findOne({ slug: id, isDeleted: { $ne: true } })
    }
    if (!damagedProduct) {
      return res.status(404).json({ message: 'Poškozený produkt nenalezen' })
    }
    res.json(damagedProduct)
  } catch (error) {
    res.status(500).json({ message: 'Chyba při načítání poškozeného produktu' })
  }
})

router.post('/', apiKeyAuth, async (req: Request, res: Response) => {
  const {
    bathBombType,
    weight,
    price,
    damageLevel,
    stockCount,
    inStock,
    imageUrl,
    description,
  } = req.body

  try {
    const newDamagedProduct = new DamagedProduct({
      bathBombType,
      weight,
      price,
      damageLevel,
      stockCount,
      inStock,
      imageUrl,
      description,
    })

    const savedProduct = await newDamagedProduct.save()
    res.status(201).json(savedProduct)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při vytváření poškozeného produktu', error: err })
  }
})

router.put('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const updatedProduct = await DamagedProduct.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
    if (!updatedProduct) {
      return res.status(404).json({ message: 'Poškozený produkt nenalezen' })
    }
    res.json(updatedProduct)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při aktualizaci poškozeného produktu', error: err })
  }
})

router.delete('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const deleted = await DamagedProduct.findByIdAndDelete(req.params.id)
    if (!deleted) {
      return res.status(404).json({ message: 'Poškozený produkt nenalezen' })
    }
    res.json({ message: 'Poškozený produkt smazán' })
  } catch (err) {
    res.status(500).json({ message: 'Chyba při mazání poškozeného produktu', error: err })
  }
})

router.patch('/:id/soft-delete', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const product = await DamagedProduct.findById(req.params.id)

    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Poškozený produkt nenalezen' })
    }

    product.isDeleted = true
    await product.save()

    res.json({ message: 'Poškozený produkt byl soft smazán' })
  } catch (error) {
    res.status(500).json({ message: 'Chyba při soft mazání poškozeného produktu' })
  }
})

router.patch('/:id/undelete', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const product = await DamagedProduct.findById(req.params.id)

    if (!product || !product.isDeleted) {
      return res.status(404).json({ message: 'Poškozený produkt nenalezen nebo není smazán' })
    }

    product.isDeleted = false
    await product.save()

    res.json({ message: 'Poškozený produkt byl obnoven (undelete)', product })
  } catch (error) {
    res.status(500).json({ message: 'Chyba při obnově poškozeného produktu', error })
  }
})

export default router
