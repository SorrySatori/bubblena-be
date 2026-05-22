import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in .env')
}

// Generate acronym from product name: take first 4 uppercase consonants/letters
function generateAcronym(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z]/g, '').toUpperCase()
  return cleaned.slice(0, 4)
}

async function migrate() {
  await mongoose.connect(MONGODB_URI!)
  console.log('✅ Connected to MongoDB')

  const db = mongoose.connection.db!

  const products = await db.collection('products').find({ isDeleted: { $ne: true } }).toArray()
  console.log(`Found ${products.length} products to copy`)

  const bombs = products.map((product) => ({
    name: product.name,
    acronym: generateAcronym(product.name),
    shortDescription: product.shortDescription || '',
    description: product.description || '',
    lots: [],
    storageMethod: product.storageMethod || '',
    imageUrl: product.imageUrl,
    videoUrl: product.videoUrl,
    bathImageUrl: product.bathImageUrl,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }))

  if (bombs.length > 0) {
    const result = await db.collection('bombs').insertMany(bombs)
    console.log(`✅ Inserted ${result.insertedCount} bombs`)
  } else {
    console.log('No products to migrate')
  }

  // Print results for review
  const inserted = await db.collection('bombs').find({}).toArray()
  console.log('\nBombs in DB:')
  inserted.forEach((b) => {
    console.log(`  - ${b.name} (acronym: ${b.acronym})`)
  })

  await mongoose.disconnect()
  console.log('\n✅ Done. Disconnected.')
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
