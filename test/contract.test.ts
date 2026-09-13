import { describe, it, expect, beforeAll, afterAll } from "vitest"

/**
 * API contract guard. bubblena-fe has TWO deployed branches that talk to this
 * backend: `main` (public preview, intentionally old) and `dev`. A route may
 * only be removed from this list once NEITHER storefront calls it any more.
 * Failing here means a deploy of `main` would break a live storefront.
 */
const REQUIRED_ROUTES: Array<[string, string]> = [
  // --- used by bubblena-fe `main` (preview) ---
  ["GET", "/api/products"],
  ["GET", "/api/products/:id"],
  ["GET", "/api/steamers"],
  ["GET", "/api/steamers/:id"],
  ["POST", "/api/cart"],
  ["GET", "/api/cart/:cartId"],
  ["POST", "/api/cart/:cartId/add"],
  ["PUT", "/api/cart/:cartId/items"],
  ["POST", "/api/checkout/create-session"],
  ["POST", "/api/order/create"],
  // --- used by bubblena-fe `dev` ---
  ["GET", "/api/bombs"],
  ["GET", "/api/bombs/:id"],
  ["GET", "/api/damaged-products"],
  ["GET", "/api/damaged-products/:id"],
  ["GET", "/api/order/:orderId"],
  ["POST", "/api/discount-codes/validate"],
  ["POST", "/api/auth/register"],
  ["POST", "/api/auth/verify"],
  ["POST", "/api/auth/login"],
  ["POST", "/api/auth/google"],
  ["GET", "/api/auth/me"],
  ["PATCH", "/api/auth/me"],
  ["GET", "/api/auth/orders"],
  ["POST", "/api/stripe/webhook"],
  // --- used by bubblena-admin ---
  ["GET", "/api/order"],
  ["PATCH", "/api/order/:orderId/status"],
  ["POST", "/api/order/:orderId/shipment"],
  ["GET", "/api/order/:orderId/shipment/label"],
  ["POST", "/api/bombs/:id/add-batch"],
  ["PUT", "/api/bombs/:id"],
  ["PUT", "/api/steamers/:id"],
  ["PUT", "/api/damaged-products/:id"],
  ["GET", "/api/raw-materials"],
  ["GET", "/api/recipes"],
  ["POST", "/api/production"],
]

describe("API contract", () => {
  let base = ""
  let server: any

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy"
    delete process.env.API_KEY // guarded routes answer 401/503 immediately, never touching MongoDB
    const { app } = await import("../src/app")
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve())
    })
    base = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(() => server?.close())

  it("serves the health root", async () => {
    const res = await fetch(`${base}/`)
    expect(res.status).toBe(200)
  })

  for (const [method, path] of REQUIRED_ROUTES) {
    it(`${method} ${path} is routed`, async () => {
      const url = base + path.replace(/:[a-zA-Z]+/g, "x")
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "GET" ? undefined : "{}",
        redirect: "manual",
      })
      // 404 from Express means "no such route". Anything else (401 api key,
      // 400 validation, 503 unconfigured) proves the route is still mounted.
      expect(res.status, `${method} ${path} → ${res.status}`).not.toBe(404)
    })
  }
})
