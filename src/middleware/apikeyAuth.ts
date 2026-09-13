import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'

/** Constant-time string comparison; false when lengths differ. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb)
}

/**
 * Storefront/admin API key check. Fails closed: when API_KEY is not
 * configured, every request is rejected instead of silently passing.
 */
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const validKey = process.env.API_KEY
  if (!validKey) {
    console.error('API_KEY není nastaven – všechny chráněné požadavky jsou odmítnuty')
    return res.status(503).json({ message: 'Server není správně nakonfigurován' })
  }

  const apiKey = req.header('x-api-key') || ''
  if (!safeEqual(apiKey, validKey)) {
    return res.status(401).json({ message: 'Neplatný nebo chybějící API klíč' })
  }

  next()
}
