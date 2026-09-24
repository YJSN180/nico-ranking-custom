import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import {
  assertCounts,
  RANKING_GENRES,
  RANKING_PERIODS,
  validateGenre,
} from './publication-contract'
import { mapLimit } from './retry'
import { autoNgExcludedCounts } from './auto-ng'
import {
  CURRENT_KEY,
  rankingKey,
  validateManifest,
} from '../../workers/utils/ranking-generation.js'

export interface PublicationStore {
  read: (key: string) => Promise<{ data: any; etag: string } | null>
  write: (
    key: string,
    bytes: Uint8Array,
    options: { gzip?: boolean; ifMatch?: string; ifNoneMatch?: string },
  ) => Promise<void>
}

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

export async function publishRanking(
  store: PublicationStore,
  data: any,
  generations = true,
  now = Date.now(),
) {
  const publication = data.publication
  if (
    !publication ||
    !/^\d+-\d+$/.test(publication.generation) ||
    !Number.isFinite(Date.parse(publication.collectedAt)) ||
    now - Date.parse(publication.collectedAt) > 120 * 60_000 ||
    Date.parse(publication.collectedAt) > now ||
    data.metadata?.updatedAt !== publication.collectedAt
  ) {
    throw new Error('Invalid or stale publication artifact')
  }
  const previous = await store.read(CURRENT_KEY)
  if (previous) validateManifest(previous.data)
  if (!generations && previous)
    throw new Error('Legacy publishing is forbidden after generation cutover')
  const contentHash = digest(data)
  if (previous?.data.generation === publication.generation) {
    if (previous.data.contentHash !== contentHash)
      throw new Error('Generation content changed')
    return previous.data
  }
  if (
    previous &&
    Date.parse(previous.data.collectedAt) >= Date.parse(publication.collectedAt)
  )
    throw new Error('Refusing stale publication')
  if (Object.keys(data.genres || {}).length !== RANKING_GENRES.length)
    throw new Error('Incomplete genre set')
  const counts: Record<string, number> = {}
  const tagsByGenrePeriod: Record<string, any> = {}
  const objects: Array<{ key: string; data: any }> = []
  for (const genre of RANKING_GENRES) {
    validateGenre(genre, data.genres[genre])
    for (const period of RANKING_PERIODS) {
      const value = data.genres[genre][period]
      counts[`${genre}/${period}`] = value.items.length
      const tags: Record<string, number> = {}
      for (const item of value.items)
        for (const tag of item.tags || []) tags[tag] = (tags[tag] || 0) + 1
      const metadata = {
        version: 1,
        updatedAt: publication.collectedAt,
        genre,
        period,
      }
      objects.push({
        key: `rankings/${genre}/${period}/all.json`,
        data: {
          items: value.items,
          popularTags: value.popularTags,
          tags,
          metadata,
        },
      })
      tagsByGenrePeriod[`${genre}/${period}`] = {
        tags: Object.keys(value.tags),
        updatedAt: publication.collectedAt,
      }
      for (const [tag, items] of Object.entries(value.tags))
        objects.push({
          key: `rankings/${genre}/${period}/tags/${encodeURIComponent(tag)}.json`,
          data: {
            items,
            popularTags: value.popularTags,
            tags: {},
            metadata: { ...metadata, tag },
          },
        })
    }
  }
  let baseline = previous?.data.counts
  if (!baseline) {
    baseline = {}
    await mapLimit(
      objects.filter((o) => o.key.endsWith('/all.json')),
      8,
      async (object) => {
        const old = await store.read(object.key)
        if (old) baseline[object.key.slice(9, -9)] = old.data.items?.length || 0
      },
    )
  }
  const autoNgExcluded = autoNgExcludedCounts(publication)
  assertCounts(counts, baseline, autoNgExcluded)
  const hourlyDrops = Object.keys(counts).filter(
    (key) => key.endsWith('/hour') && baseline[key] > 0 && counts[key] < baseline[key] * 0.5,
  )
  if (hourlyDrops.length) {
    console.warn(JSON.stringify({
      stage: 'hourly-count-drift',
      drops: hourlyDrops.map((key) => ({
        key,
        current: counts[key],
        previous: baseline[key],
        ...(autoNgExcluded[key] ? { autoNgExcluded: autoNgExcluded[key] } : {}),
      })),
    }))
  }
  if (!Object.values(counts).some((count) => count > 0))
    throw new Error('All rankings are empty')
  const manifest = {
    version: 1,
    generation: publication.generation,
    runId: publication.runId,
    slot: publication.slot,
    collectedAt: publication.collectedAt,
    publishedAt: new Date(now).toISOString(),
    counts,
    contentHash,
    previousGeneration: previous?.data.generation || null,
  }
  const keyFor = (key: string) =>
    generations ? rankingKey(manifest, key) : key
  await mapLimit(objects, 8, async (object) => {
    const key = keyFor(object.key)
    const existing = await store.read(key)
    if (existing && digest(existing.data) === digest(object.data)) return
    if (existing && generations)
      throw new Error(`Immutable generation conflict: ${key}`)
    await store.write(key, gzipSync(JSON.stringify(object.data)), {
      gzip: true,
      ...(generations ? { ifNoneMatch: '*' } : {}),
    })
    const verified = await store.read(key)
    if (!verified || digest(verified.data) !== digest(object.data))
      throw new Error(`Read-back failed: ${key}`)
  })
  const metadataKey = keyFor('rankings/metadata.json')
  const metadata = {
    version: 1,
    updatedAt: publication.collectedAt,
    tagsByGenrePeriod,
  }
  const storedMetadata = await store.read(metadataKey)
  if (!storedMetadata || digest(storedMetadata.data) !== digest(metadata)) {
    if (storedMetadata && generations)
      throw new Error('Immutable metadata conflict')
    await store.write(metadataKey, gzipSync(JSON.stringify(metadata)), {
      gzip: true,
      ...(generations ? { ifNoneMatch: '*' } : {}),
    })
  }
  const verifiedMetadata = await store.read(metadataKey)
  if (!verifiedMetadata || digest(verifiedMetadata.data) !== digest(metadata))
    throw new Error('Metadata read-back failed')
  if (generations) {
    // Recheck after potentially slow uploads. CAS rejects another publisher or a concurrent rollback.
    if (Date.now() - Date.parse(publication.collectedAt) > 120 * 60_000)
      throw new Error('Publication expired while uploading')
    manifest.publishedAt = new Date().toISOString()
    const archiveKey = keyFor('rankings/manifest.json')
    const archived = await store.read(archiveKey)
    if (archived) {
      if (archived.data.contentHash !== contentHash)
        throw new Error('Immutable manifest conflict')
    } else {
      await store.write(archiveKey, Buffer.from(JSON.stringify(manifest)), {
        ifNoneMatch: '*',
      })
    }
    await store.write(
      CURRENT_KEY,
      Buffer.from(JSON.stringify(manifest)),
      previous ? { ifMatch: previous.etag } : { ifNoneMatch: '*' },
    )
  }
  return manifest
}
