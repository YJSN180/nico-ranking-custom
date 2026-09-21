import type { PublicationStore } from './publish-ranking'
import {
  CURRENT_KEY,
  rankingKey,
  validateManifest,
} from '../../workers/utils/ranking-generation.js'

export async function rollbackGeneration(
  store: PublicationStore,
  generation: string,
  apply = false,
  beforeCommit = async () => {},
) {
  if (!/^\d+-\d+$/.test(generation)) throw new Error('Invalid generation')
  const current = await store.read(CURRENT_KEY)
  if (!current) throw new Error('No generation is currently published')
  const saved = await store.read(
    `rankings/generations/${generation}/manifest.json`,
  )
  const target = validateManifest(saved?.data)
  if (target.generation !== generation)
    throw new Error('Manifest generation mismatch')
  const metadata = await store.read(
    rankingKey(target, 'rankings/metadata.json'),
  )
  if (metadata?.data.updatedAt !== target.collectedAt)
    throw new Error('Rollback metadata is incomplete')
  for (const [pair, count] of Object.entries(target.counts)) {
    if (!/^[a-z]+\/(24h|hour)$/.test(pair))
      throw new Error('Invalid ranking pair')
    const ranking = await store.read(
      rankingKey(target, `rankings/${pair}/all.json`),
    )
    if (ranking?.data.items?.length !== count)
      throw new Error('Rollback ranking is incomplete')
    for (const tag of metadata.data.tagsByGenrePeriod?.[pair]?.tags || []) {
      const object = await store.read(
        rankingKey(
          target,
          `rankings/${pair}/tags/${encodeURIComponent(tag)}.json`,
        ),
      )
      if (!Array.isArray(object?.data.items))
        throw new Error('Rollback tag is missing')
    }
  }
  if (apply) {
    await beforeCommit()
    await store.write(CURRENT_KEY, Buffer.from(JSON.stringify(target)), {
      ifMatch: current.etag,
    })
  }
  return { from: current.data.generation, to: generation, applied: apply }
}

export function cleanupCandidates(
  objects: Array<{ key: string; modified: number }>,
  manifest: { generation: string; previousGeneration?: string },
  now = Date.now(),
) {
  const protectedIds = new Set([
    manifest.generation,
    manifest.previousGeneration,
  ])
  const generations = new Map<string, typeof objects>()
  for (const object of objects) {
    const id = /^rankings\/generations\/(\d+-\d+)\//.exec(object.key)?.[1]
    if (id) generations.set(id, [...(generations.get(id) || []), object])
  }
  return [...generations]
    .filter(
      ([id, entries]) =>
        !protectedIds.has(id) &&
        entries.every(
          (item) =>
            Number.isFinite(item.modified) &&
            now - item.modified > 7 * 86400_000,
        ),
    )
    .flatMap(([, entries]) => entries.map((item) => item.key))
}
