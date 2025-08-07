import express, { Request, Response } from 'express'
import Product from '../models/Product'
import { apiKeyAuth } from '../middleware/apikeyAuth'

const router = express.Router()

//GET 
router.get('/',apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ isDeleted: { $ne: true } })
    res.json(products)
  } catch (error) {
    res.status(500).json({ message: 'Chyba při načítání produktů' })
  }
})

//POST
router.post('/', apiKeyAuth, async (req: Request, res: Response) => {
  const {
    name,
    shortDescription,
    description,
    price,
    inStock,
    stockCount,
    imageUrl,
    storageMethod,
    bathImageUrl,
    videoUrl,
  } = req.body

  try {
    const newProduct = new Product({
      name,
      shortDescription,
      description,
      price,
      inStock,
      stockCount,
      imageUrl,
      storageMethod,
      bathImageUrl,
      videoUrl,
    })

    const savedProduct = await newProduct.save()
    res.status(201).json(savedProduct)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při vytváření produktu', error: err })
  }
})

// PUT
router.put('/:id', apiKeyAuth, apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
    if (!updatedProduct) {
      return res.status(404).json({ message: 'Produkt nenalezen' })
    }
    res.json(updatedProduct)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při aktualizaci produktu', error: err })
  }
})

//DELETE
router.delete('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id)
    if (!deleted) {
      return res.status(404).json({ message: 'Produkt nenalezen' })
    }
    res.json({ message: 'Produkt smazán' })
  } catch (err) {
    res.status(500).json({ message: 'Chyba při mazání produktu', error: err })
  }
})

//SOFT DELETE
// @route   PATCH /api/products/:id/soft-delete
router.patch('/:id/soft-delete', apiKeyAuth, async (req:Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id)

    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Produkt nenalezen' })
    }

    product.isDeleted = true
    await product.save()

    res.json({ message: 'Produkt byl soft smazán' })
  } catch (error) {
    res.status(500).json({ message: 'Chyba při soft mazání produktu' })
  }
})

//UNDELETE
// @route   PATCH /api/products/:id/undelete
router.patch('/:id/undelete', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id)

    if (!product || !product.isDeleted) {
      return res.status(404).json({ message: 'Produkt nenalezen nebo není smazán' })
    }

    product.isDeleted = false
    await product.save()

    res.json({ message: 'Produkt byl obnoven (undelete)', product })
  } catch (error) {
    res.status(500).json({ message: 'Chyba při obnově produktu', error })
  }
})

export default router
