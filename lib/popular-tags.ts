// 各ジャンルの人気タグ
// 動的取得が失敗した場合のフォールバック用
// 最新のデータはgetPopularTags関数で取得すること

import type { RankingGenre } from '../types/ranking-config'

async function getGenreRanking(genre: RankingGenre, period: '24h' | 'hour') {
  // Protected deployments can use an explicitly configured public ranking gateway.
  const deployment = process.env.RANKING_SSR_GATEWAY_URL || (process.env.VERCEL_ENV === 'production'
    ? 'https://nico-rank.com'
    : process.env.VERCEL_URL)
  const base = deployment
    ? deployment.startsWith('http') ? deployment : `https://${deployment}`
    : process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'https://nico-rank.com'
  const url = new URL('/api/ranking', base)
  url.search = new URLSearchParams({ genre, period }).toString()
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'nico-ranking-web/1.0',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('Ranking gateway unavailable')
  const data = await response.json() as { popularTags?: unknown }
  if (!Array.isArray(data.popularTags) || data.popularTags.some((tag: unknown) => typeof tag !== 'string')) {
    throw new Error('Invalid popular tags')
  }
  return data as { popularTags: string[] }
}

// ジャンルの人気タグを取得（キャッシュ付き）
export async function getPopularTags(genre: RankingGenre, period: '24h' | 'hour' = '24h'): Promise<string[]> {
  // 「すべて」ジャンルの場合は、他のジャンルから人気タグを集計
  if (genre === 'all') {
    try {
      const genres: RankingGenre[] = ['game', 'anime', 'entertainment', 'technology', 'voicesynthesis', 'other']
      const tagCountMap = new Map<string, number>()

      // 各ジャンルの人気タグを並列に取得し（直列だと各 10 秒の期限が積み重なる）、従来と同じジャンル順で集計
      const tagLists = await Promise.all(genres.map((g) => getPopularTagsForGenre(g, period)))
      for (const tags of tagLists) {
        tags.forEach((tag, index) => {
          // 順位が高いタグほど高いスコアを付与（15位から1位へ）
          const score = tags.length - index
          tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + score)
        })
      }
      
      // スコア順にソートして上位15個を返す
      const sortedTags = Array.from(tagCountMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([tag]) => tag)
      
      return sortedTags
    } catch (error) {
      // Failed to aggregate popular tags for all genre - returning empty array
      return []
    }
  }
  
  return getPopularTagsForGenre(genre, period)
}

// 個別ジャンルの人気タグ（公開済みの R2 世代をゲートウェイ経由で読む）。取れなければ空。
// 以前はさらに nvapi のランキング（lib/scraper.ts）へ落ちていたが、そちらは人気タグを返さない
// （タグ API の廃止で常に空）うえ、ジャンルをエンコードせずに URL のパスへ入れ、タイムアウトも無かった
async function getPopularTagsForGenre(genre: RankingGenre, period: '24h' | 'hour' = '24h'): Promise<string[]> {
  try {
    const cfData = await getGenreRanking(genre, period)
    if (cfData.popularTags.length > 0) return cfData.popularTags
  } catch {
    // ゲートウェイが使えなければ空（呼び出し元は空配列で縮退する）
  }
  return []
}
