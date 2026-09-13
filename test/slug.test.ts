import { describe, it, expect } from "vitest"
import { slugify } from "../src/utils/slug"

describe("slugify", () => {
  it("strips Czech diacritics and lowercases", () => {
    expect(slugify("Šumivá koule Levandule")).toBe("sumiva-koule-levandule")
  })
  it("collapses punctuation and trims dashes", () => {
    expect(slugify("  Kokos & banán!  ")).toBe("kokos-banan")
  })
  it("returns empty string for symbol-only input", () => {
    expect(slugify("***")).toBe("")
  })
})
