import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

export interface JwtPayload {
  sub: string;
  email: string;
}

/**
 * Verifies the customer JWT sent by the Nitro proxy as `Authorization: Bearer <token>`
 * and attaches the user's id/email to the request. The token is signed by this
 * backend (JWT_SECRET); the Nuxt layer only shuttles it from an httpOnly cookie.
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Přihlášení vyžadováno" });
  }

  const token = header.slice("Bearer ".length).trim();
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("JWT_SECRET není nastaven");
    return res.status(500).json({ message: "Server není správně nakonfigurován" });
  }

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch {
    return res.status(401).json({ message: "Neplatný nebo expirovaný token" });
  }
};
