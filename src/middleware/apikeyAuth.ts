import { Request, Response, NextFunction } from 'express'

export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.header('x-api-key')
  const validKey = process.env.API_KEY

  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({ message: 'Neplatný nebo chybějící API klíč' })
  }

  next()
}
