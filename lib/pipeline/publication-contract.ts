import { summarizeAutoNg } from './auto-ng'

export const RANKING_GROUPS = [
  ['all', 'game'],
  ['anime', 'vocaloid'],
  ['voicesynthesis', 'entertainment'],
  ['music', 'sing'],
  ['dance', 'play', 'commentary', 'cooking'],
  ['travel', 'nature', 'vehicle', 'technology'],
  ['society', 'mmd', 'vtuber', 'radio'],
  ['sports', 'animal', 'other'],
]
export const RANKING_GENRES = RANKING_GROUPS.flat()
export const RANKING_PERIODS = ['24h', 'hour'] as const

export interface GroupArtifact {
  version: 1
  runId: string
  attempt: string
  slot: string
  groupId: number
  collectedAt: string
  completedAt: string
  /** 自動NG の状態（lib/pipeline/auto-ng.ts の AutoNgStatus） */
  autoNg?: unknown
  /** autoNgExcluded は自動NG で除いた件数（AutoNgExcludedByPeriod） */
  results: Array<{ genre: string; data: any; hadErrors?: boolean; autoNgExcluded?: unknown }>
}

export function validateGenre(genre: string, data: any): void {
  for (const period of RANKING_PERIODS) {
    const value = data?.[period]
    if (
      !value ||
      !Array.isArray(value.items) ||
      !Array.isArray(value.popularTags) ||
      !value.tags ||
      typeof value.tags !== 'object' ||
      Array.isArray(value.tags)
    ) {
      throw new Error(`Invalid ranking structure: ${genre}/${period}`)
    }
    for (const items of [value.items, ...Object.values(value.tags)]) {
      if (
        !Array.isArray(items) ||
        items.some((item) => !item || typeof item.id !== 'string' || !item.id)
      ) {
        throw new Error(`Invalid ranking items: ${genre}/${period}`)
      }
    }
    if (
      value.popularTags.some(
        (tag: unknown) =>
          typeof tag !== 'string' || !Object.hasOwn(value.tags, tag),
      )
    ) {
      throw new Error(`Missing tag ranking: ${genre}/${period}`)
    }
  }
}

export function aggregateArtifacts(
  artifacts: GroupArtifact[],
  runId: string,
  now = Date.now(),
) {
  if (artifacts.length !== RANKING_GROUPS.length)
    throw new Error('Exactly 8 group artifacts are required')
  const seen = new Set<number>()
  const genres: Record<string, any> = {}
  let earliest = now
  const slot = artifacts[0]?.slot
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:20:00\.000Z$/.test(slot) ||
    !Number.isFinite(Date.parse(slot))
  )
    throw new Error('Invalid schedule slot')
  for (const a of artifacts) {
    const expected = RANKING_GROUPS[a.groupId - 1]
    const started = Date.parse(a.collectedAt)
    const ended = Date.parse(a.completedAt)
    if (
      a.version !== 1 ||
      a.runId !== runId ||
      !/^\d+$/.test(a.attempt) ||
      a.slot !== slot ||
      !expected ||
      seen.has(a.groupId) ||
      !Array.isArray(a.results) ||
      a.results.length !== expected.length ||
      !Number.isFinite(started) ||
      !Number.isFinite(ended) ||
      ended < started ||
      ended > now + 60_000 ||
      started > now ||
      now - started > 120 * 60_000
    ) {
      throw new Error(`Invalid, stale or foreign artifact: group ${a.groupId}`)
    }
    seen.add(a.groupId)
    earliest = Math.min(earliest, started)
    for (const result of a.results) {
      if (
        !expected.includes(result.genre) ||
        genres[result.genre] ||
        result.hadErrors
      ) {
        throw new Error(`Missing, duplicate or failed genre: ${result.genre}`)
      }
      validateGenre(result.genre, result.data)
      genres[result.genre] = result.data
    }
  }
  const counts = Object.fromEntries(
    Object.entries(genres).flatMap(([genre, data]) =>
      RANKING_PERIODS.map((period) => [
        `${genre}/${period}`,
        data[period].items.length,
      ]),
    ),
  )
  const totalItems = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0,
  )
  if (!totalItems) throw new Error('All rankings are empty')
  return {
    genres,
    metadata: {
      version: 1,
      updatedAt: new Date(earliest).toISOString(),
      totalItems,
      ngFiltered: true,
    },
    publication: {
      runId,
      slot,
      generation: `${runId}-${Math.max(...artifacts.map((a) => Number(a.attempt)))}`,
      collectedAt: new Date(earliest).toISOString(),
      counts,
      autoNg: summarizeAutoNg(artifacts),
    },
  }
}

export function assertCounts(
  current: Record<string, number>,
  previous: Record<string, number> = {},
  autoNgExcluded: Record<string, number> = {},
) {
  // 自動NG で除いた件数は収集の欠落ではないので足し戻して比べる（自動NG の除外で公開を止めない）
  const collected = (key: string) => current[key] + (autoNgExcluded[key] ?? 0)
  for (const [key, count] of Object.entries(current)) {
    if (
      !Number.isFinite(count) ||
      count < 0 ||
      (previous[key] > 0 &&
        collected(key) < previous[key] * 0.5 &&
        (!key.endsWith('/hour') || key === 'all/hour'))
    ) {
      throw new Error(`Ranking count dropped below 50%: ${key}`)
    }
  }
  // Small hourly genres vary naturally; detect an overall hourly collapse instead.
  const hourlyKeys = Object.keys(current).filter((key) => key.endsWith('/hour'))
  const hourlyCurrent = hourlyKeys.reduce((sum, key) => sum + collected(key), 0)
  const hourlyPrevious = hourlyKeys.reduce(
    (sum, key) => sum + (previous[key] || 0),
    0,
  )
  if (hourlyPrevious > 0 && hourlyCurrent < hourlyPrevious * 0.5) {
    throw new Error('Hourly ranking total dropped below 50%')
  }
}
