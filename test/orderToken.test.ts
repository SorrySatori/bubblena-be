import { describe, it, expect, beforeAll } from "vitest"
import { orderAccessToken } from "../src/utils/orderToken"

describe("orderAccessToken", () => {
  beforeAll(() => {
    process.env.INTERNAL_TOKEN = "test-secret"
  })
  it("is deterministic for the same order and differs between orders", () => {
    const a = orderAccessToken("11111111-1111-4111-8111-111111111111")
    const b = orderAccessToken("22222222-2222-4222-8222-222222222222")
    expect(a).toBe(orderAccessToken("11111111-1111-4111-8111-111111111111"))
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
  it("fails closed without a secret", () => {
    const saved = process.env.INTERNAL_TOKEN
    delete process.env.INTERNAL_TOKEN
    expect(() => orderAccessToken("x")).toThrow()
    process.env.INTERNAL_TOKEN = saved
  })
})
