import express, { Request, Response } from 'express'
import Recipe from '../models/Recipe'
import { apiKeyAuth } from '../middleware/apikeyAuth'

const router = express.Router()

// GET all recipes
router.get('/', apiKeyAuth, async (_req: Request, res: Response) => {
  try {
    const recipes = await Recipe.find({ isDeleted: { $ne: true } }).sort({ name: 1 })
    res.json(recipes)
  } catch (error) {
    res.status(500).json({ message: 'Chyba při načítání receptů' })
  }
})

// GET single recipe
router.get('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const recipe = await Recipe.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
    if (!recipe) return res.status(404).json({ message: 'Recept nenalezen' })
    res.json(recipe)
  } catch (error) {
    res.status(500).json({ message: 'Chyba při načítání receptu' })
  }
})

// POST create recipe
router.post('/', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { name, acronym, ingredients, notes, productType, productId } = req.body
    if (!name || !acronym) return res.status(400).json({ message: 'Název a zkratka jsou povinné' })

    const recipe = new Recipe({
      name,
      acronym,
      ingredients: ingredients || [],
      productType: productType || null,
      productId: productId || undefined,
      notes,
    })
    const saved = await recipe.save()
    res.status(201).json(saved)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při vytváření receptu', error: err })
  }
})

// PUT update recipe
router.put('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { name, acronym, ingredients, notes, productType, productId } = req.body
    const recipe = await Recipe.findById(req.params.id)
    if (!recipe || recipe.isDeleted) return res.status(404).json({ message: 'Recept nenalezen' })

    if (name !== undefined) recipe.name = name
    if (acronym !== undefined) recipe.acronym = acronym
    if (ingredients !== undefined) recipe.ingredients = ingredients
    if (notes !== undefined) recipe.notes = notes
    if (productType !== undefined) recipe.productType = productType || null
    if (productId !== undefined) recipe.productId = productId || undefined

    const saved = await recipe.save()
    res.json(saved)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při aktualizaci receptu', error: err })
  }
})

// DELETE (soft delete)
router.delete('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const recipe = await Recipe.findById(req.params.id)
    if (!recipe || recipe.isDeleted) return res.status(404).json({ message: 'Recept nenalezen' })
    recipe.isDeleted = true
    await recipe.save()
    res.json({ message: 'Recept smazán' })
  } catch (err) {
    res.status(500).json({ message: 'Chyba při mazání receptu', error: err })
  }
})

export default router
