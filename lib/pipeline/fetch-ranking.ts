import type { RankingGenre } from '../../types/ranking-config'
import type { RankingItem } from '../../types/ranking'

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

export class RankingNotReadyError extends Error {
  constructor(
    readonly genre: RankingGenre,
    readonly period: '24h' | 'hour',
    readonly tag: string | undefined,
    readonly page: number,
  ) {
    super(`Ranking not ready: ${genre}/${period}, tag=${tag ?? '(main)'}, page=${page}`)
    this.name = 'RankingNotReadyError'
  }
}

function parseRankingPage(
  html: string,
  status: number,
  genre: RankingGenre,
  period: '24h' | 'hour',
  tag: string | undefined,
  page: number,
) {
  const serverData = extractServerResponseData(html)
  if (
    status === 202 &&
    serverData.meta?.status === 202 &&
    serverData.meta?.code === 'HTTP_202' &&
    serverData.meta?.errorHeading === 'このランキングは準備中です。'
  ) {
    throw new RankingNotReadyError(genre, period, tag, page)
  }
  const rankingData = serverData.data?.response?.$getTeibanRanking?.data
  if (status !== 200 || !Array.isArray(rankingData?.items)) {
    throw new Error(`Invalid ranking response: ${genre}/${period}, tag=${tag ?? '(main)'}, page=${page}, HTTP ${status}`)
  }
  const pagination = serverData.data?.response?.page?.pagination
  const hasNextPage =
    pagination?.page === page &&
    Number.isInteger(pagination.pageSize) &&
    pagination.pageSize > 0 &&
    Number.isInteger(pagination.totalCount) &&
    pagination.totalCount >= 0
      ? page * pagination.pageSize < pagination.totalCount
      : undefined
  const items: RankingItem[] = rankingData.items.map((item: any, index: number) => ({
    rank: (page - 1) * 100 + index + 1,
    id: item.id,
    title: item.title,
    thumbURL: convertThumbnailUrl(item.thumbnail?.url || item.thumbnail?.middleUrl || ''),
    views: item.count?.view || 0,
    comments: item.count?.comment || 0,
    mylists: item.count?.mylist || 0,
    likes: item.count?.like || 0,
    tags: item.tags || [],
    authorId: item.owner?.id || item.user?.id,
    authorName: item.owner?.name || item.user?.nickname || item.channel?.name,
    authorIcon: item.owner?.iconUrl || item.user?.iconUrl || item.channel?.iconUrl,
    registeredAt: item.registeredAt || item.startTime || item.createTime,
    duration: item.duration,
  }))
  return { items, popularTags: extractTrendTags(serverData), hasNextPage }
}

export async function fetchWithGooglebot(url: string): Promise<Response> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: {
      'User-Agent': GOOGLEBOT_UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja',
      Cookie: 'sensitive_material_status=accept'
    }
  })

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText} for URL: ${url}`)
  }

  return response
}

export function extractServerResponseData(html: string): any {
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
  if (!metaMatch || !metaMatch[1]) {
    throw new Error('server-responseメタタグが見つかりません')
  }

  const decodedData = metaMatch[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")

  return JSON.parse(decodedData)
}

export function extractTrendTags(serverData: any): string[] {
  try {
    const trendTags = serverData.data?.response?.$getTeibanRankingFeaturedKeyAndTrendTags?.data?.trendTags

    if (!Array.isArray(trendTags)) {
      return []
    }

    return trendTags.filter((tag: any) => typeof tag === 'string' && tag.trim().length > 0)
  } catch {
    return []
  }
}

export function convertThumbnailUrl(url: string): string {
  return url.replace(/\.M$/, '.L')
}

export async function fetchRankingPageWithRetry(
  genre: RankingGenre,
  period: '24h' | 'hour',
  tag?: string,
  page: number = 1,
  maxRetries: number = 3,
  genreIdMap?: Record<RankingGenre, string>
): Promise<{ items: RankingItem[]; popularTags: string[]; hasNextPage?: boolean }> {
  let genreId = genreIdMap ? genreIdMap[genre] : genre
  let url = `https://www.nicovideo.jp/ranking/genre/${genreId}?term=${period}`

  if (tag) {
    url += `&tag=${encodeURIComponent(tag)}`
  }
  if (page > 1) {
    url += `&page=${page}`
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetchWithGooglebot(url)
      const html = await response.text()

      const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.nicovideo\.jp\/ranking\/genre\/([^?/\"]+)/)
      const actualGenreId = canonicalMatch ? canonicalMatch[1] : null

      if (actualGenreId && actualGenreId !== genreId) {
        const titleMatch = html.match(/<title>([^<]+)<\/title>/)
        const isGeneralFallback = titleMatch && titleMatch[1].includes('総合')

        if (!isGeneralFallback) {
          console.warn(`⚠️ Genre ID change detected for ${genre}:`)
          console.warn(`   Old ID: ${genreId}`)
          console.warn(`   New ID: ${actualGenreId}`)
          console.warn('   ✅ Auto-updating to use new ID...')

          if (genreIdMap) {
            genreIdMap[genre] = actualGenreId
          }
          genreId = actualGenreId

          url = `https://www.nicovideo.jp/ranking/genre/${genreId}?term=${period}`
          if (tag) url += `&tag=${encodeURIComponent(tag)}`
          if (page > 1) url += `&page=${page}`

          const correctedResponse = await fetchWithGooglebot(url)
          const correctedHtml = await correctedResponse.text()
          return parseRankingPage(correctedHtml, correctedResponse.status, genre, period, tag, page)
        }
      }

      return parseRankingPage(html, response.status, genre, period, tag, page)
    } catch (error: any) {
      lastError = error

      if (error instanceof RankingNotReadyError) throw error

      if (error.message && error.message.includes('404')) {
        throw error
      }

      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
        console.warn(`Retry ${attempt + 1}/${maxRetries} for ${genre}/${period}/page${page} after ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError || new Error('Unknown error')
}
