import { describe, it, expect } from "vitest"
import { pick } from "../src/utils/pick"

describe("pick", () => {
  it("keeps only whitelisted keys", () => {
    expect(pick({ name: "a", isDeleted: true, _id: "x" }, ["name"])).toEqual({ name: "a" })
  })
  it("drops Mongo operators even when whitelisted by mistake", () => {
    expect(pick({ $set: { isDeleted: true }, name: "a" }, ["$set", "name"])).toEqual({ name: "a" })
  })
  it("tolerates non-object bodies", () => {
    expect(pick(null, ["name"])).toEqual({})
    expect(pick("str", ["name"])).toEqual({})
  })
  it("ignores inherited properties", () => {
    const body = Object.create({ name: "proto" })
    expect(pick(body, ["name"])).toEqual({})
  })
})
