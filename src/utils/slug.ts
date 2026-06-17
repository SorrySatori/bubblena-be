import { Schema, Model } from 'mongoose'

/** Czech-aware slug: strips diacritics, lowercases, dashes non-alphanumerics. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining diacritical marks
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Auto-populate a `slug` on save (only when missing) from `sourceField`,
 * ensuring uniqueness within the collection by appending -2, -3, … on collision.
 * Existing documents keep their slug; this never overwrites a set value.
 */
export function attachSlugHook(schema: Schema, sourceField: string): void {
  schema.pre('save', async function (next) {
    try {
      const self = this as any
      if (!self.slug && self[sourceField]) {
        const base = slugify(String(self[sourceField])) || String(self._id)
        let candidate = base
        let n = 1
        const ModelRef = self.constructor as Model<any>
        // eslint-disable-next-line no-await-in-loop
        while (await ModelRef.exists({ slug: candidate, _id: { $ne: self._id } })) {
          candidate = `${base}-${++n}`
        }
        self.slug = candidate
      }
      next()
    } catch (err) {
      next(err as Error)
    }
  })
}
