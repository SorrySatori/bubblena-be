import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/User";

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
  /** User.tokenVersion at issue time; a mismatch means the token was revoked. */
  ver?: number;
}

/**
 * Verifies the customer JWT sent by the Nitro proxy as `Authorization: Bearer <token>`
 * and attaches the user's id/email to the request. The token is signed by this
 * backend (JWT_SECRET); the Nuxt layer only shuttles it from an httpOnly cookie.
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
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

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, secret) as JwtPayload;
  } catch {
    return res.status(401).json({ message: "Neplatný nebo expirovaný token" });
  }

  // Revocation: the token must match the user's current tokenVersion.
  const user = await UserModel.findById(payload.sub).select("tokenVersion email");
  if (!user || (user.tokenVersion ?? 0) !== (payload.ver ?? 0)) {
    return res.status(401).json({ message: "Neplatný nebo expirovaný token" });
  }

  req.userId = payload.sub;
  req.userEmail = user.email;
  next();
};
