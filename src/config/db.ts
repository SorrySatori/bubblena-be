import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI
console.log('KEK', MONGODB_URI)

if (!MONGODB_URI) {
  throw new Error('⚠️ Chybí MONGODB_URI v .env souboru')
}

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Připojeno k MongoDB')
  } catch (error) {
    console.error('❌ Chyba při připojování k MongoDB:', error)
    process.exit(1)
  }
}
