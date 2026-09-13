/**
 * Keep only whitelisted top-level keys of a request body. Used by admin PUT
 * routes so a client can never set `isDeleted`, `_id`, `slug`, timestamps or
 * inject Mongo operators through `findByIdAndUpdate(id, req.body)`.
 */
export function pick<T extends Record<string, unknown>>(body: unknown, keys: readonly string[]): Partial<T> {
  const out: Record<string, unknown> = {}
  if (!body || typeof body !== 'object') return out as Partial<T>
  for (const key of keys) {
    if (key.startsWith('$')) continue
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = (body as any)[key]
  }
  return out as Partial<T>
}
