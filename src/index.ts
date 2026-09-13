// src/index.ts – process bootstrap. The Express app itself lives in app.ts so
// tests can import it without connecting to MongoDB or opening a port.
import dotenv from 'dotenv'
dotenv.config()

import { connectDB } from './config/db'
import { startOrderCleanupScheduler } from './services/orderLifecycle'
import { app } from './app'

const PORT = process.env.PORT || 3000

connectDB().then(() => {
  // Cancel abandoned card orders (restores stock + discount codes).
  startOrderCleanupScheduler()
  app.listen(PORT, () => {
    console.log(`🚀 Server běží na http://localhost:${PORT}`)
  })
})
