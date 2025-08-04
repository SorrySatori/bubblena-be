import express from 'express'
import Product from '../models/Product'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const products = await Product.find()
    res.json(products)
  } catch (err) {
    res.status(500).json({ message: 'Chyba při načítání produktů' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) {
      return res.status(404).json({ message: 'Produkt nenalezen' })
    }
    res.json(product)
  } catch (err) {
    res.status(500).json({ message: 'Chyba při načítání produktu' })
  }
})

router.post('/', async (req, res) => {
  const {
    name,
    shortDescription,
    description,
    price,
    inStock,
    stockCount,
    imageUrl,
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
    })

    const savedProduct = await newProduct.save()
    res.status(201).json(savedProduct)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při vytváření produktu', error: err })
  }
})

router.put('/:id', async (req, res) => {
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

router.delete('/:id', async (req, res) => {
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

export default router
