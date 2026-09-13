import { describe, it, expect } from "vitest"
import { appendBatch, nextBatchInfo, steamerAcronym } from "../src/utils/batching"

const entity = () => ({ lots: [] as { lotNumber: string; batches: { batchId: string }[] }[] })

describe("batch numbering", () => {
  it("starts a first lot and pads numbers", () => {
    expect(nextBatchInfo(entity(), "BB", "KB")).toEqual({ batchId: "KB-001", lotNumber: "BB-KB-001", isNewLot: true })
  })
  it("opens a new lot every 10 batches and numbers batches across lots", () => {
    const e = entity()
    for (let i = 0; i < 10; i++) appendBatch(e, "BB", "KB", (batchId) => ({ batchId }))
    expect(e.lots).toHaveLength(1)
    const eleventh = appendBatch(e, "BB", "KB", (batchId) => ({ batchId }))
    expect(eleventh).toEqual({ batchId: "KB-011", lotNumber: "BB-KB-002" })
    expect(e.lots).toHaveLength(2)
  })
  it("derives steamer acronyms from letters only", () => {
    expect(steamerAcronym("Levandule 2.0")).toBe("LEVA")
  })
})
