export async function acquireLease(bucket, key, durationMs, now = Date.now()) {
  const previous = await bucket.get(key)
  if (previous && (await previous.json()).expiresAt > now) return null
  const owner = crypto.randomUUID()
  const expiresAt = now + durationMs
  const result = await bucket.put(key, JSON.stringify({ owner, expiresAt }), {
    onlyIf: previous
      ? { etagMatches: previous.etag }
      : { etagDoesNotMatch: '*' },
  })
  if (!result) return null
  return {
    async assertOwned() {
      const current = await bucket.get(key)
      if (
        !current ||
        (await current.json()).owner !== owner ||
        expiresAt < Date.now() + 30_000
      )
        throw new Error('Lease expired or replaced')
    },
    async release() {
      await bucket.put(key, JSON.stringify({ owner, expiresAt: 0 }), {
        onlyIf: { etagMatches: result.etag },
      })
    },
  }
}
