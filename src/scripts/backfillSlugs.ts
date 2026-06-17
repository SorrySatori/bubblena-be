import 'dotenv/config'
import mongoose from 'mongoose'
import Product from '../models/Product'
import Steamer from '../models/Steamer'
import DamagedProduct from '../models/DamagedProduct'

/**
 * One-time backfill of `slug` for documents created before slugs existed.
 * Re-saving each slug-less doc triggers the pre-save hook, which generates a
 * unique slug. Safe to run multiple times (docs that already have a slug are
 * skipped). Run with:  npx ts-node src/scripts/backfillSlugs.ts
 */
async function backfill(Model: any, label: string) {
  const docs = await Model.find({
    $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }],
  })
  let updated = 0
  for (const doc of docs) {
    await doc.save() // pre-save hook fills the slug
    updated++
  }
  console.log(`${label}: backfilled ${updated} slug(s)`)
}

async function run() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI not set')
  await mongoose.connect(uri)
  await backfill(Product, 'Product')
  await backfill(Steamer, 'Steamer')
  await backfill(DamagedProduct, 'DamagedProduct')
  await mongoose.disconnect()
  console.log('Done.')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
