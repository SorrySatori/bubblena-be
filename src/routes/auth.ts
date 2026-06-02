import express, { Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { UserModel, IUser } from "../models/User";
import { OrderModel } from "../models/Order";
import { apiKeyAuth } from "../middleware/apikeyAuth";
import { requireAuth } from "../middleware/requireAuth";

const router = express.Router();

// All auth endpoints are reached through the Nitro proxy, which carries x-api-key.
router.use(apiKeyAuth);

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const JWT_TTL = "30d";

const normalizeEmail = (email: unknown) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

function signToken(user: IUser): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET není nastaven");
  return jwt.sign({ sub: String(user._id), email: user.email }, secret, {
    expiresIn: JWT_TTL,
  });
}

function publicUser(user: IUser) {
  return {
    id: String(user._id),
    email: user.email,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    phone: user.phone || "",
    address: user.address || { street: "", city: "", postalCode: "", country: "CZ" },
    emailVerified: user.emailVerified,
    authProvider: user.authProvider,
    marketingConsent: !!user.marketingConsent,
  };
}

function makeVerifyToken() {
  return {
    verifyToken: crypto.randomBytes(32).toString("hex"),
    verifyTokenExpires: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
  };
}

// POST /api/auth/register — create unverified user, return verifyToken (Nitro sends the email)
router.post("/register", async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const { password, firstName, lastName, acceptTerms, marketing } = req.body || {};

    if (!email || !password || String(password).length < 8) {
      return res.status(400).json({
        message: "E-mail a heslo (min. 8 znaků) jsou povinné.",
      });
    }

    // Consent to terms + privacy policy is mandatory to create an account.
    if (acceptTerms !== true) {
      return res.status(400).json({
        message: "Pro registraci je nutný souhlas s obchodními podmínkami a zásadami ochrany osobních údajů.",
      });
    }

    const now = new Date();
    const marketingConsent = marketing === true;

    const existing = await UserModel.findOne({ email }).select(
      "+passwordHash +verifyToken +verifyTokenExpires"
    );

    if (existing) {
      // Already a usable local account → tell them to log in.
      if (existing.passwordHash && existing.emailVerified) {
        return res.status(409).json({ message: "Účet s tímto e-mailem už existuje. Přihlaste se." });
      }
      // Registered via Google only → guide them to Google login.
      if (existing.authProvider === "google" && !existing.passwordHash) {
        return res.status(409).json({
          message: "Tento e-mail je registrován přes Google. Přihlaste se přes Google.",
          provider: "google",
        });
      }
      // Local but never verified → refresh password + token and resend the email.
      const { verifyToken, verifyTokenExpires } = makeVerifyToken();
      existing.passwordHash = await bcrypt.hash(String(password), 10);
      existing.firstName = firstName ?? existing.firstName;
      existing.lastName = lastName ?? existing.lastName;
      existing.verifyToken = verifyToken;
      existing.verifyTokenExpires = verifyTokenExpires;
      existing.termsAcceptedAt = now;
      existing.marketingConsent = marketingConsent;
      existing.marketingConsentAt = marketingConsent ? now : null;
      await existing.save();
      return res.status(200).json({ email: existing.email, verifyToken });
    }

    const { verifyToken, verifyTokenExpires } = makeVerifyToken();
    const user = await UserModel.create({
      email,
      passwordHash: await bcrypt.hash(String(password), 10),
      firstName: firstName || "",
      lastName: lastName || "",
      authProvider: "local",
      emailVerified: false,
      verifyToken,
      verifyTokenExpires,
      termsAcceptedAt: now,
      marketingConsent,
      marketingConsentAt: marketingConsent ? now : null,
    });

    return res.status(201).json({ email: user.email, verifyToken });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ message: "Registrace se nezdařila." });
  }
});

// POST /api/auth/verify — confirm email, auto-login
router.post("/verify", async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const { token } = req.body || {};
    if (!email || !token) {
      return res.status(400).json({ message: "Chybí e-mail nebo ověřovací token." });
    }

    const user = await UserModel.findOne({ email }).select("+verifyToken +verifyTokenExpires");
    if (!user || !user.verifyToken || user.verifyToken !== token) {
      return res.status(400).json({ message: "Neplatný ověřovací odkaz." });
    }
    if (user.verifyTokenExpires && user.verifyTokenExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: "Ověřovací odkaz vypršel. Zaregistrujte se znovu." });
    }

    user.emailVerified = true;
    user.verifyToken = null;
    user.verifyTokenExpires = null;
    await user.save();

    return res.status(200).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error("Verify error:", error);
    return res.status(500).json({ message: "Ověření se nezdařilo." });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const { password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "Zadejte e-mail a heslo." });
    }

    const user = await UserModel.findOne({ email }).select("+passwordHash");
    if (!user || !user.passwordHash) {
      if (user && user.authProvider === "google") {
        return res.status(401).json({
          message: "Tento e-mail je registrován přes Google. Přihlaste se přes Google.",
          provider: "google",
        });
      }
      return res.status(401).json({ message: "Nesprávný e-mail nebo heslo." });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Nesprávný e-mail nebo heslo." });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ message: "Nejdřív ověřte svůj e-mail (odkaz v e-mailu)." });
    }

    return res.status(200).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Přihlášení se nezdařilo." });
  }
});

// POST /api/auth/google — verify Google ID token, find-or-create user
router.post("/google", async (req: Request, res: Response) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ message: "Přihlášení přes Google není nakonfigurováno." });
    }

    const { credential } = req.body || {};
    if (!credential) {
      return res.status(400).json({ message: "Chybí Google credential." });
    }

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    const email = normalizeEmail(payload?.email);

    if (!payload || !email || !payload.email_verified) {
      return res.status(401).json({ message: "Google účet se nepodařilo ověřit." });
    }

    let user = await UserModel.findOne({ email });
    if (user) {
      // Link Google to an existing account.
      if (!user.googleId) user.googleId = payload.sub;
      if (!user.emailVerified) user.emailVerified = true;
      if (!user.firstName && payload.given_name) user.firstName = payload.given_name;
      if (!user.lastName && payload.family_name) user.lastName = payload.family_name;
      await user.save();
    } else {
      const now = new Date();
      const marketingConsent = req.body?.marketing === true;
      user = await UserModel.create({
        email,
        googleId: payload.sub,
        authProvider: "google",
        emailVerified: true,
        firstName: payload.given_name || "",
        lastName: payload.family_name || "",
        // Consent given via the registration/login screen notice before the action.
        termsAcceptedAt: now,
        marketingConsent,
        marketingConsentAt: marketingConsent ? now : null,
      });
    }

    return res.status(200).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error("Google auth error:", error);
    return res.status(401).json({ message: "Přihlášení přes Google se nezdařilo." });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findById(req.userId);
    if (!user) return res.status(404).json({ message: "Uživatel nenalezen." });
    return res.status(200).json({ user: publicUser(user) });
  } catch (error) {
    console.error("Me error:", error);
    return res.status(500).json({ message: "Načtení profilu se nezdařilo." });
  }
});

// PATCH /api/auth/me — update profile + address
router.patch("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findById(req.userId);
    if (!user) return res.status(404).json({ message: "Uživatel nenalezen." });

    const { firstName, lastName, phone, address, marketingConsent } = req.body || {};
    if (typeof firstName === "string") user.firstName = firstName;
    if (typeof lastName === "string") user.lastName = lastName;
    if (typeof phone === "string") user.phone = phone;
    if (typeof marketingConsent === "boolean") {
      // Lets the user withdraw/grant marketing consent (GDPR right to withdraw).
      if (marketingConsent !== user.marketingConsent) {
        user.marketingConsent = marketingConsent;
        user.marketingConsentAt = marketingConsent ? new Date() : null;
      }
    }
    if (address && typeof address === "object") {
      user.address = {
        street: String(address.street ?? user.address?.street ?? ""),
        city: String(address.city ?? user.address?.city ?? ""),
        postalCode: String(address.postalCode ?? user.address?.postalCode ?? ""),
        country: String(address.country ?? user.address?.country ?? "CZ"),
      };
    }
    await user.save();

    return res.status(200).json({ user: publicUser(user) });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ message: "Uložení profilu se nezdařilo." });
  }
});

// GET /api/auth/orders — the user's orders, matched by their (verified) email
router.get("/orders", requireAuth, async (req: Request, res: Response) => {
  try {
    const orders = await OrderModel.find({ "customerInfo.email": req.userEmail }).sort({
      createdAt: -1,
    });
    return res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error("Fetch user orders error:", error);
    return res.status(500).json({ success: false, message: "Načtení objednávek se nezdařilo." });
  }
});

export default router;
