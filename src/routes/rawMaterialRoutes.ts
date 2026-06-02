import express, { Request, Response } from 'express'
import RawMaterial from '../models/RawMaterial'
import Recipe from '../models/Recipe'
import Bomb from '../models/Bomb'
import Steamer from '../models/Steamer'
import { apiKeyAuth } from '../middleware/apikeyAuth'
import { SEED_MATERIALS, SEED_STOCK, SEED_RECIPES } from '../seed/warehouseSeed'

const router = express.Router()

// Recompute currentStock from non-consumed batches.
function recomputeStock(material: any) {
  material.currentStock = material.batches
    .filter((b: any) => !b.consumed)
    .reduce((sum: number, b: any) => sum + b.quantity, 0)
}

// POST seed default warehouse data (materials + initial stock + recipes). Guarded: skips if data exists.
router.post('/seed', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const existingMaterials = await RawMaterial.countDocuments()
    const existingRecipes = await Recipe.countDocuments()
    if (existingMaterials > 0 || existingRecipes > 0) {
      return res.status(400).json({
        message: 'Sklad už obsahuje data. Seed přeskočen, aby nevznikly duplikáty.',
        materials: existingMaterials,
        recipes: existingRecipes,
      })
    }

    const stockByName = new Map(SEED_STOCK.map(s => [s.materialName, s]))

    // 1) materials (+ initial stock batch where defined)
    const materialDocs = SEED_MATERIALS.map(name => {
      const stock = stockByName.get(name)
      const batches = stock
        ? [{
            batchNumber: stock.batchNumber,
            quantity: stock.quantity,
            initialQuantity: stock.quantity,
            dateStocked: stock.dateStocked,
            consumed: false,
          }]
        : []
      return {
        name,
        lowStockThreshold: 0,
        currentStock: stock ? stock.quantity : 0,
        batches,
        isDeleted: false,
      }
    })
    const insertedMaterials = await RawMaterial.insertMany(materialDocs)
    const idByName = new Map(insertedMaterials.map(m => [m.name, m._id.toString()]))

    // 2) recipes (resolve materialId by name; bind to finished product by name → ID, one-time)
    const bombs = await Bomb.find({ isDeleted: { $ne: true } })
    const steamers = await Steamer.find({ isDeleted: { $ne: true } })
    const bombByName = new Map(bombs.map(b => [b.name.toLowerCase(), b]))
    const steamerByName = new Map(steamers.map(s => [s.name.toLowerCase(), s]))

    const recipeDocs = SEED_RECIPES.map(r => {
      const nameLc = r.name.toLowerCase()
      const bomb = bombByName.get(nameLc)
      const steamer = steamerByName.get(nameLc)
      let productType: 'bomb' | 'steamer' | null = null
      let productId: string | undefined
      if (bomb) {
        productType = 'bomb'
        productId = bomb._id.toString()
      } else if (steamer) {
        productType = 'steamer'
        productId = steamer._id.toString()
      }
      return {
        name: r.name,
        acronym: r.acronym,
        ingredients: r.ingredients.map(ing => ({
          materialId: idByName.get(ing.materialName) || '',
          materialName: ing.materialName,
          quantity: ing.quantity,
        })),
        productType,
        productId,
        isDeleted: false,
      }
    })
    const insertedRecipes = await Recipe.insertMany(recipeDocs)

    res.status(201).json({
      message: `Seed dokončen: ${insertedMaterials.length} surovin, ${insertedRecipes.length} receptů.`,
      materials: insertedMaterials.length,
      recipes: insertedRecipes.length,
    })
  } catch (err) {
    res.status(500).json({ message: 'Seed selhal', error: err })
  }
})

// GET all materials
router.get('/', apiKeyAuth, async (_req: Request, res: Response) => {
  try {
    const materials = await RawMaterial.find({ isDeleted: { $ne: true } }).sort({ name: 1 })
    res.json(materials)
  } catch (error) {
    res.status(500).json({ message: 'Chyba při načítání surovin' })
  }
})

// GET single material
router.get('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const material = await RawMaterial.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
    if (!material) return res.status(404).json({ message: 'Surovina nenalezena' })
    res.json(material)
  } catch (error) {
    res.status(500).json({ message: 'Chyba při načítání suroviny' })
  }
})

// POST create material
router.post('/', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { name, lowStockThreshold, supplierName, purchaseLink, notes } = req.body
    if (!name) return res.status(400).json({ message: 'Název je povinný' })

    const material = new RawMaterial({
      name,
      lowStockThreshold: lowStockThreshold || 0,
      supplierName,
      purchaseLink,
      notes,
      currentStock: 0,
      batches: [],
    })
    const saved = await material.save()
    res.status(201).json(saved)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při vytváření suroviny', error: err })
  }
})

// PUT update material fields (not batches)
router.put('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { name, lowStockThreshold, supplierName, purchaseLink, notes } = req.body
    const material = await RawMaterial.findById(req.params.id)
    if (!material || material.isDeleted) return res.status(404).json({ message: 'Surovina nenalezena' })

    if (name !== undefined) material.name = name
    if (lowStockThreshold !== undefined) material.lowStockThreshold = lowStockThreshold
    if (supplierName !== undefined) material.supplierName = supplierName
    if (purchaseLink !== undefined) material.purchaseLink = purchaseLink
    if (notes !== undefined) material.notes = notes

    const saved = await material.save()
    res.json(saved)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při aktualizaci suroviny', error: err })
  }
})

// DELETE (soft delete)
router.delete('/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const material = await RawMaterial.findById(req.params.id)
    if (!material || material.isDeleted) return res.status(404).json({ message: 'Surovina nenalezena' })
    material.isDeleted = true
    await material.save()
    res.json({ message: 'Surovina smazána' })
  } catch (err) {
    res.status(500).json({ message: 'Chyba při mazání suroviny', error: err })
  }
})

// POST add intake batch (naskladnit šarži). Quantity in grams.
router.post('/:id/add-batch', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { batchNumber, quantity, dateStocked } = req.body
    if (!batchNumber || quantity === undefined || quantity < 0) {
      return res.status(400).json({ message: 'batchNumber a quantity (>=0) jsou povinné' })
    }

    const material = await RawMaterial.findById(req.params.id)
    if (!material || material.isDeleted) return res.status(404).json({ message: 'Surovina nenalezena' })

    const qty = Number(quantity)
    material.batches.push({
      batchNumber,
      quantity: qty,
      initialQuantity: qty,
      dateStocked: dateStocked || new Date().toISOString().split('T')[0],
      consumed: qty <= 0,
    } as any)
    recomputeStock(material)

    const saved = await material.save()
    res.status(201).json(saved)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při přidávání šarže', error: err })
  }
})

// PUT update a specific intake batch
router.put('/:id/batch/:batchId', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { batchNumber, quantity, initialQuantity, dateStocked } = req.body
    const material = await RawMaterial.findById(req.params.id)
    if (!material || material.isDeleted) return res.status(404).json({ message: 'Surovina nenalezena' })

    const batch = material.batches.find((b: any) => b._id?.toString() === req.params.batchId)
    if (!batch) return res.status(404).json({ message: 'Šarže nenalezena' })

    if (batchNumber !== undefined) batch.batchNumber = batchNumber
    if (quantity !== undefined) batch.quantity = Number(quantity)
    if (initialQuantity !== undefined) batch.initialQuantity = Number(initialQuantity)
    if (dateStocked !== undefined) batch.dateStocked = dateStocked
    batch.consumed = batch.quantity <= 0
    if (!batch.consumed) batch.dateConsumed = undefined

    recomputeStock(material)
    const saved = await material.save()
    res.json(saved)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při úpravě šarže', error: err })
  }
})

// DELETE a specific intake batch
router.delete('/:id/batch/:batchId', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const material = await RawMaterial.findById(req.params.id)
    if (!material || material.isDeleted) return res.status(404).json({ message: 'Surovina nenalezena' })

    material.batches = material.batches.filter((b: any) => b._id?.toString() !== req.params.batchId) as any
    recomputeStock(material)
    const saved = await material.save()
    res.json(saved)
  } catch (err) {
    res.status(400).json({ message: 'Chyba při mazání šarže', error: err })
  }
})

export default router
