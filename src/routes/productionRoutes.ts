import express, { Request, Response } from 'express'
import ProductionRecord, { MaterialConsumption, SourceBatch } from '../models/ProductionRecord'
import Recipe from '../models/Recipe'
import RawMaterial from '../models/RawMaterial'
import Bomb from '../models/Bomb'
import Steamer from '../models/Steamer'
import { apiKeyAuth } from '../middleware/apikeyAuth'
import { appendBatch, steamerAcronym } from '../utils/batching'

const router = express.Router()

// GET all production records (newest first) — serves both Výroba and Evidence šarží
router.get('/', apiKeyAuth, async (_req: Request, res: Response) => {
  try {
    const records = await ProductionRecord.find().sort({ dateProduced: -1, createdAt: -1 })
    res.json(records)
  } catch (error) {
    res.status(500).json({ message: 'Chyba při načítání výroby' })
  }
})

// POST produce a batch: FIFO-deduct raw materials, add a batch to the matching Bomb/Steamer,
// and store a production/evidence record.
router.post('/', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { recipeId, sizes, dateProduced } = req.body

    if (!recipeId) return res.status(400).json({ message: 'recipeId je povinný' })
    const validSizes = (sizes || []).filter((s: any) => s.weight > 0 && s.quantity > 0)
    if (validSizes.length === 0) {
      return res.status(400).json({ message: 'Zadejte alespoň jednu velikost s množstvím' })
    }

    const recipe = await Recipe.findById(recipeId)
    if (!recipe || recipe.isDeleted) return res.status(404).json({ message: 'Recept nenalezen' })

    // Load all materials referenced by the recipe
    const materialIds = recipe.ingredients.map(i => i.materialId)
    const materials = await RawMaterial.find({ _id: { $in: materialIds } })
    const materialById = new Map(materials.map(m => [m._id.toString(), m]))

    // 1) Validate enough stock for every ingredient
    for (const ingredient of recipe.ingredients) {
      const material = materialById.get(ingredient.materialId)
      if (!material) {
        return res.status(400).json({ message: `Surovina "${ingredient.materialName}" nenalezena ve skladu` })
      }
      if (material.currentStock < ingredient.quantity) {
        return res.status(400).json({
          message: `Nedostatek suroviny "${ingredient.materialName}": potřeba ${ingredient.quantity} g, skladem ${material.currentStock} g`,
        })
      }
    }

    // 2) Resolve & validate the bound finished product BEFORE deducting any materials,
    //    so a missing/invalid product never leaves the warehouse half-deducted.
    let boundBomb: any = null
    let boundSteamer: any = null
    if (recipe.productType === 'bomb' && recipe.productId) {
      boundBomb = await Bomb.findOne({ _id: recipe.productId, isDeleted: { $ne: true } })
      if (!boundBomb) {
        return res.status(400).json({ message: 'Navázaná koule (Bomb) nebyla nalezena. Zkontrolujte recept.' })
      }
    } else if (recipe.productType === 'steamer' && recipe.productId) {
      boundSteamer = await Steamer.findOne({ _id: recipe.productId, isDeleted: { $ne: true } })
      if (!boundSteamer) {
        return res.status(400).json({ message: 'Navázaný steamer nebyl nalezen. Zkontrolujte recept.' })
      }
    }

    // 3) FIFO deduct (oldest batch first; spill remainder into newer batches)
    const now = new Date().toISOString()
    const materialsUsed: MaterialConsumption[] = []

    for (const ingredient of recipe.ingredients) {
      const material = materialById.get(ingredient.materialId)!
      let remaining = ingredient.quantity
      const sourceBatches: SourceBatch[] = []

      const availableBatches = material.batches
        .filter((b: any) => !b.consumed && b.quantity > 0)
        .sort((a: any, b: any) => {
          const dt = new Date(a.dateStocked).getTime() - new Date(b.dateStocked).getTime()
          if (dt !== 0) return dt
          // tiebreaker: older _id first (insertion order)
          return String(a._id).localeCompare(String(b._id))
        })

      for (const batch of availableBatches) {
        if (remaining <= 0) break
        const used = Math.min(batch.quantity, remaining)
        batch.quantity -= used
        remaining -= used
        sourceBatches.push({
          batchId: batch._id ? batch._id.toString() : '',
          batchNumber: batch.batchNumber,
          quantityUsed: used,
        })
        if (batch.quantity <= 0) {
          batch.consumed = true
          batch.dateConsumed = now
        }
      }

      material.currentStock = material.batches
        .filter((b: any) => !b.consumed)
        .reduce((sum: number, b: any) => sum + b.quantity, 0)

      materialsUsed.push({
        materialId: material._id.toString(),
        materialName: material.name,
        quantity: ingredient.quantity,
        sourceBatches,
      })
    }

    // Persist all material changes
    await Promise.all(materials.map(m => m.save()))

    // 4) Add a batch to the bound finished product (resolved in step 2 by recipe.productId)
    let batchNumber = ''
    let lotNumber = ''
    let productType: 'bomb' | 'steamer' | null = null
    let productId: string | undefined

    if (boundBomb) {
      const priceByWeight = new Map(boundBomb.pricing.map((p: any) => [p.weight, p.price]))
      const assigned = appendBatch(boundBomb, 'BB', boundBomb.acronym, (batchId) => ({
        batchId,
        variants: validSizes.map((s: { weight: number; quantity: number }) => ({
          weight: s.weight,
          price: priceByWeight.get(s.weight) || 0,
          stockCount: s.quantity,
          inStock: s.quantity > 0,
        })),
      }))
      await boundBomb.save()
      batchNumber = assigned.batchId
      lotNumber = assigned.lotNumber
      productType = 'bomb'
      productId = boundBomb._id.toString()
    } else if (boundSteamer) {
      const totalQty = validSizes.reduce((sum: number, s: { quantity: number }) => sum + s.quantity, 0)
      const acronym = steamerAcronym(boundSteamer.name)
      const assigned = appendBatch(boundSteamer, 'ST', acronym, (batchId) => ({
        batchId,
        stockCount: totalQty,
      }))
      boundSteamer.stockCount = (boundSteamer.stockCount || 0) + totalQty
      boundSteamer.inStock = boundSteamer.stockCount > 0
      await boundSteamer.save()
      batchNumber = assigned.batchId
      lotNumber = assigned.lotNumber
      productType = 'steamer'
      productId = boundSteamer._id.toString()
    }

    // Fallback batch number if recipe is not bound to a finished product (still follows acronym-NNN style)
    if (!batchNumber) {
      const count = await ProductionRecord.countDocuments({ recipeAcronym: recipe.acronym })
      batchNumber = `${recipe.acronym.toUpperCase()}-${String(count + 1).padStart(3, '0')}`
    }

    // 4) Store production / evidence record
    const record = new ProductionRecord({
      recipeId: recipe._id.toString(),
      recipeName: recipe.name,
      recipeAcronym: recipe.acronym,
      batchNumber,
      lotNumber,
      productType,
      productId,
      sizes: validSizes,
      dateProduced: dateProduced || now.split('T')[0],
      materialsUsed,
    })
    const saved = await record.save()

    res.status(201).json({ record: saved, productType, productId })
  } catch (err) {
    res.status(400).json({ message: 'Chyba při výrobě', error: err })
  }
})

// PUT update production record (notes / materialsUsed evidence)
router.put('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { notes, materialsUsed, expiryDate } = req.body
    const record = await ProductionRecord.findById(req.params.id)
    if (!record) return res.status(404).json({ message: 'Záznam nenalezen' })

    if (notes !== undefined) record.notes = notes
    if (materialsUsed !== undefined) record.materialsUsed = materialsUsed
    if (expiryDate !== undefined) record.expiryDate = expiryDate

    const saved = await record.save()
    res.json(saved)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při úpravě záznamu', error: err })
  }
})

export default router
