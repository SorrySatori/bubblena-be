// src/index.ts
import express from 'express'
import dotenv from 'dotenv'
import { connectDB } from './config/db'
import cors from 'cors'
import productRoutes from './routes/productRoutes'

const app = express()
const PORT = process.env.PORT || 3000

dotenv.config()
app.use(cors())
app.use(express.json())

// Ukázková route
app.get('/', (req, res) => {
  res.send('API běží!')
})

app.use('/api/products', productRoutes)

// Připoj DB a spusť server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server běží na http://localhost:${PORT}`)
  })
})
