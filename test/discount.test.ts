import { describe, it, expect } from "vitest"
import { calculateDiscount } from "../src/routes/discountCodeRoutes"

const code = (over: Partial<any>) =>
  ({ code: "TEST", type: "global", percentage: 0, freeShipping: false, ...over }) as any

describe("calculateDiscount", () => {
  it("applies a percentage to the subtotal only", () => {
    const d = calculateDiscount(code({ percentage: 10 }), 199.9, 99)
    expect(d.percentageDiscount).toBe(19.99)
    expect(d.shippingDiscount).toBe(0)
    expect(d.totalDiscount).toBe(19.99)
  })
  it("free shipping discounts exactly the shipping price", () => {
    const d = calculateDiscount(code({ freeShipping: true }), 500, 99)
    expect(d).toMatchObject({ percentageDiscount: 0, shippingDiscount: 99, totalDiscount: 99 })
  })
  it("rounds to cents", () => {
    const d = calculateDiscount(code({ percentage: 33 }), 10, 0)
    expect(d.totalDiscount).toBe(3.3)
  })
})
