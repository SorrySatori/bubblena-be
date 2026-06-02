// src/index.ts
import express, { Request, Response } from 'express'
import dotenv from 'dotenv'
import { connectDB } from './config/db'
import cors from 'cors'
import productRoutes from './routes/productRoutes'
import steamerRoutes from './routes/steamerRoutes'
import damagedProductRoutes from './routes/damagedProductRoutes'
import cartRoutes from "./routes/cartRoutes"
import cookieParser from "cookie-parser"
import checkoutRouter from "./routes/checkout"
import packetaRoutes from "./routes/packeta"
import glsRoutes from "./routes/gls"
import ordersRouter from "./routes/order"
import discountCodeRoutes from "./routes/discountCodeRoutes"
import bombRoutes from "./routes/bombRoutes"
import rawMaterialRoutes from "./routes/rawMaterialRoutes"
import recipeRoutes from "./routes/recipeRoutes"
import productionRoutes from "./routes/productionRoutes"

const app = express()
const PORT = process.env.PORT || 3000

dotenv.config()
app.use(cors())
app.use(express.json())
app.use(cookieParser())

app.get('/', (req: Request, res: Response) => {
  res.send('API běží!')
})

app.use('/api/products', productRoutes)
app.use('/api/steamers', steamerRoutes)
app.use('/api/damaged-products', damagedProductRoutes)
app.use("/api/cart", cartRoutes)
app.use("/api/checkout", checkoutRouter)
app.use("/api/packeta", packetaRoutes)
app.use("/api/gls", glsRoutes)
app.use("/api/order", ordersRouter)
app.use("/api/discount-codes", discountCodeRoutes)
app.use("/api/bombs", bombRoutes)
app.use("/api/raw-materials", rawMaterialRoutes)
app.use("/api/recipes", recipeRoutes)
app.use("/api/production", productionRoutes)

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server běží na http://localhost:${PORT}`)
  })
})
