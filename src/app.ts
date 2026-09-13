// Express application without network/DB side effects (see index.ts for bootstrap).
import express, { Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import steamerRoutes from './routes/steamerRoutes'
import damagedProductRoutes from './routes/damagedProductRoutes'
import legacyProductRoutes from './routes/legacyProductRoutes'
import cartRoutes from './routes/cartRoutes'
import cookieParser from "cookie-parser"
import checkoutRouter from "./routes/checkout"
import stripeWebhookRouter from "./routes/stripeWebhook"
import ordersRouter from "./routes/order"
import discountCodeRoutes from "./routes/discountCodeRoutes"
import bombRoutes from "./routes/bombRoutes"
import rawMaterialRoutes from "./routes/rawMaterialRoutes"
import recipeRoutes from "./routes/recipeRoutes"
import productionRoutes from "./routes/productionRoutes"
import authRoutes from "./routes/auth"
import { apiKeyAuth } from './middleware/apikeyAuth'

export const app = express()

// Render terminates TLS and forwards X-Forwarded-*; trust one hop so req.ip /
// req.secure reflect the client, not the proxy.
app.set('trust proxy', 1)

// Security headers. CSP is off: this is a JSON API (plus one PDF label route),
// and a document CSP would only get in the way of the PDF viewer.
app.use(helmet({ contentSecurityPolicy: false }))

// CORS: the storefront talks to this API server-side (Nitro), so browsers only
// need CORS for the admin app. Restrict to CORS_ORIGINS when set
// (comma-separated); fall back to permissive for backwards compatibility.
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
app.use(cors(corsOrigins.length ? { origin: corsOrigins } : undefined))

// Stripe webhook needs the raw body for signature verification → mount it
// BEFORE express.json() so the JSON parser never touches it.
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookRouter)

app.use(express.json({ limit: "100kb" }))
app.use(cookieParser())

app.get('/', (req: Request, res: Response) => {
  res.send('API běží!')
})

// Catalog / warehouse routers guard each handler with apiKeyAuth themselves.
app.use('/api/steamers', steamerRoutes)
// Compatibility for the preview storefront (bubblena-fe `main`) – see legacyProductRoutes.ts.
app.use('/api/products', legacyProductRoutes)
app.use('/api/damaged-products', damagedProductRoutes)
app.use("/api/discount-codes", discountCodeRoutes)
app.use("/api/bombs", bombRoutes)
app.use("/api/raw-materials", rawMaterialRoutes)
app.use("/api/recipes", recipeRoutes)
app.use("/api/production", productionRoutes)
app.use("/api/auth", authRoutes)

// Order pipeline: every route requires the API key (the Nitro proxy and the
// admin app both send it). Nothing here is reachable anonymously.
app.use("/api/cart", apiKeyAuth, cartRoutes)
app.use("/api/checkout", apiKeyAuth, checkoutRouter)
app.use("/api/order", apiKeyAuth, ordersRouter)
