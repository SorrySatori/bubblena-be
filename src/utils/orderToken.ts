import crypto from "crypto"

/**
 * Capability token for reading ONE order's confirmation data without being
 * logged in (guest checkout). HMAC over the orderId with the shared
 * INTERNAL_TOKEN, so the Nuxt side can verify it without a round-trip.
 * It grants read access to a reduced projection only (see the Nuxt proxy).
 */
export function orderAccessToken(orderId: string): string {
  const secret = process.env.INTERNAL_TOKEN
  if (!secret) throw new Error("INTERNAL_TOKEN není nastaven")
  return crypto.createHmac("sha256", secret).update(`order:${orderId}`).digest("base64url")
}
