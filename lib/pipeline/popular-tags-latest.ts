// 人気タグだけを集めた小さな KV キー（/api/popular-tags の高速パス）。
// scripts/sync-ranking-auxiliary.ts が公開成功後に書き、lib/popular-tags.ts が読む。
// 非圧縮 JSON（simple-kv の kv.get で読める形）。

export const POPULAR_TAGS_LATEST_KEY = 'POPULAR_TAGS_LATEST'

export type PopularTagsPeriod = '24h' | 'hour'

export interface PopularTagsLatest {
  updatedAt: string
  genres: Record<string, Record<PopularTagsPeriod, string[]>>
  all: Record<PopularTagsPeriod, string[]>
}

// 「総合」の集計元と採点は lib/popular-tags.ts の getPopularTags('all') と揃える
export const POPULAR_TAGS_ALL_SOURCE_GENRES = [
  'game',
  'anime',
  'entertainment',
  'technology',
  'voicesynthesis',
  'other',
] as const
const POPULAR_TAGS_ALL_LIMIT = 15

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function popularTagsOf(genreData: unknown, period: PopularTagsPeriod): string[] {
  if (!isRecord(genreData)) return []
  const periodData = genreData[period]
  if (!isRecord(periodData) || !Array.isArray(periodData.popularTags)) return []
  return periodData.popularTags.filter((tag): tag is string => typeof tag === 'string')
}

function aggregateAll(genres: PopularTagsLatest['genres'], period: PopularTagsPeriod): string[] {
  const score = new Map<string, number>()
  for (const genre of POPULAR_TAGS_ALL_SOURCE_GENRES) {
    const tags = genres[genre]?.[period] ?? []
    // 順位が高いタグほど高いスコア（15位から1位へ）。同点は出現順
    tags.forEach((tag, index) => score.set(tag, (score.get(tag) ?? 0) + (tags.length - index)))
  }
  return Array.from(score.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, POPULAR_TAGS_ALL_LIMIT)
    .map(([tag]) => tag)
}

/** 集約済みランキング（genres[genre][period].popularTags）から小キーの中身を作る */
export function buildPopularTagsLatest(
  rankingGenres: Record<string, unknown>,
  updatedAt: string,
): PopularTagsLatest {
  const genres: PopularTagsLatest['genres'] = {}
  for (const [genre, data] of Object.entries(rankingGenres)) {
    genres[genre] = { '24h': popularTagsOf(data, '24h'), hour: popularTagsOf(data, 'hour') }
  }
  return {
    updatedAt,
    genres,
    all: { '24h': aggregateAll(genres, '24h'), hour: aggregateAll(genres, 'hour') },
  }
}
