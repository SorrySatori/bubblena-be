import { describe, it, expect } from "vitest"
import { HttpError, priceItems, roundMoney, SHIPPING_PRICES, PAYMENT_SURCHARGE } from "../src/services/pricing"

describe("pricing guards (no DB needed)", () => {
  it("rejects an empty or missing item list with 400", async () => {
    await expect(priceItems([])).rejects.toMatchObject({ status: 400 })
    await expect(priceItems(undefined)).rejects.toBeInstanceOf(HttpError)
  })
  it("rejects absurd item counts", async () => {
    const items = Array.from({ length: 101 }, () => ({ id: "x", quantity: 1 }))
    await expect(priceItems(items)).rejects.toMatchObject({ status: 400 })
  })
  it("rejects non-integer, zero or negative quantities before touching the DB", async () => {
    await expect(priceItems([{ id: "abc", quantity: 0 }])).rejects.toMatchObject({ status: 400 })
    await expect(priceItems([{ id: "abc", quantity: 1.5 }])).rejects.toMatchObject({ status: 400 })
    await expect(priceItems([{ id: "abc", quantity: -2 }])).rejects.toMatchObject({ status: 400 })
  })
  it("has a server-side price list for every shipping/payment method", () => {
    expect(SHIPPING_PRICES).toEqual({ zasilkovna: 99, gls: 99 })
    expect(Object.keys(PAYMENT_SURCHARGE).sort()).toEqual(["bank-transfer", "card"])
  })
  it("roundMoney rounds to cents", () => {
    expect(roundMoney(19.995)).toBe(20)
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
  })
})
