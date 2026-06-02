// Shared lot/batch numbering rules for products that hold `lots: [{ lotNumber, batches: [{ batchId, ... }] }]`
// (Bomb, Steamer) and for production records that mirror those rules.
//
// Rules (single source of truth):
//   - batchId   = `${acronym}-${NNN}`        (running number across ALL lots, padded to 3 digits)
//   - a new LOT is started every 10 batches
//   - lotNumber = `${lotPrefix}-${acronym}-${NNN}`  e.g. BB-KB-001 (bombs), ST-LEV-001 (steamers)

export interface LotLike {
  lotNumber: string
  batches: { batchId: string }[]
}

export interface EntityWithLots {
  lots: LotLike[]
}

/**
 * Compute the next batchId / lotNumber for an entity, following the shared rules.
 * Does NOT mutate the entity.
 */
export function nextBatchInfo(
  entity: EntityWithLots,
  lotPrefix: string,
  acronym: string
): { batchId: string; lotNumber: string; isNewLot: boolean } {
  const totalBatches = entity.lots.reduce((sum, lot) => sum + lot.batches.length, 0)
  const newBatchNumber = totalBatches + 1
  const batchId = `${acronym}-${String(newBatchNumber).padStart(3, '0')}`

  const lastLot = entity.lots[entity.lots.length - 1]
  const isNewLot = !lastLot || lastLot.batches.length >= 10

  let lotNumber: string
  if (isNewLot) {
    const newLotNumber = entity.lots.length + 1
    lotNumber = `${lotPrefix}-${acronym}-${String(newLotNumber).padStart(3, '0')}`
  } else {
    lotNumber = lastLot.lotNumber
  }

  return { batchId, lotNumber, isNewLot }
}

/**
 * Append a batch to an entity following the shared lot/batch rules.
 * `makeBatch(batchId)` builds the batch payload for the given assigned batchId.
 * Returns the assigned batchId and lotNumber. Mutates `entity.lots`.
 */
export function appendBatch<B extends { batchId: string }>(
  entity: EntityWithLots,
  lotPrefix: string,
  acronym: string,
  makeBatch: (batchId: string) => B
): { batchId: string; lotNumber: string } {
  const { batchId, lotNumber, isNewLot } = nextBatchInfo(entity, lotPrefix, acronym)
  const batch = makeBatch(batchId)

  if (isNewLot) {
    entity.lots.push({ lotNumber, batches: [batch] } as any)
  } else {
    entity.lots[entity.lots.length - 1].batches.push(batch as any)
  }

  return { batchId, lotNumber }
}

/** Acronym used for steamers: letters only, uppercased, first 4 chars (matches existing behavior). */
export function steamerAcronym(name: string): string {
  return name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4)
}
