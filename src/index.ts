// src/index.ts
import express, { Request, Response } from 'express'
import dotenv from 'dotenv'
import { connectDB } from './config/db'
import cors from 'cors'
import productRoutes from './routes/productRoutes'
import cartRoutes from "./routes/cartRoutes";
import cookieParser from "cookie-parser";

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
app.use("/api/cart", cartRoutes)

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server běží na http://localhost:${PORT}`)
  })
})
