import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { fetchRankingWithRetry } from '@/lib/complete-hybrid-scraper'
import { filterRankingData } from '@/lib/ng-filter'
import { trackTagUsage, getTagCacheTTL } from '@/lib/tag-popularity-tracker'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const genre = searchParams.get('genre') || 'all'
  const period = searchParams.get('period') || '24h'
  const tag = searchParams.get('tag') || undefined
  const page = parseInt(searchParams.get('page') || '1', 10)

  // Validate inputs
  const validGenres = ['all', 'game', 'entertainment', 'music', 'other', 'tech', 'anime', 'animal', 'd2um7mc4']
  const validPeriods = ['24h', 'hour']
  
  if (!validGenres.includes(genre) || !validPeriods.includes(period)) {
    return NextResponse.json({ error: 'Invalid genre or period' }, { status: 400 })
  }

  try {
    // タグ使用統計を記録（人気度追跡のため）
    if (tag) {
      await trackTagUsage(genre, tag)
    }

    // キャッシュキーの生成
    const cacheKey = tag 
      ? `ranking-${genre}-${period}-tag-${tag}${page > 1 ? `-page${page}` : ''}`
      : `ranking-${genre}-${period}`

    // KVキャッシュから取得を試みる
    const cached = await kv.get(cacheKey)
    
    if (cached) {
      console.log(`[API] Cache hit for ${cacheKey}`)
      
      // キャッシュされたデータがオブジェクト形式（通常ランキング）の場合
      if (!Array.isArray(cached) && typeof cached === 'object' && 'items' in cached) {
        const response = NextResponse.json(cached)
        response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
        response.headers.set('X-Cache-Status', 'HIT')
        return response
      }
      
      // 配列形式（タグランキング）の場合
      const response = NextResponse.json(cached)
      response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
      response.headers.set('X-Cache-Status', 'HIT')
      return response
    }

    console.log(`[API] Cache miss for ${cacheKey}, fetching fresh data...`)

    // タグ別ランキングの場合
    if (tag) {
      // NGフィルタリング後に100件確保するため、最大3ページまで取得
      const targetCount = 100
      let allItems: any[] = []
      let currentPage = page
      const maxAttempts = 3

      while (allItems.length < targetCount && currentPage < page + maxAttempts) {
        const { items: pageItems } = await fetchRankingWithRetry(
          genre as RankingGenre,
          period as RankingPeriod,
          tag,
          100,
          currentPage
        )

        if (!pageItems || pageItems.length === 0) {
          break
        }

        // NGフィルタリングを適用
        const { items: filteredItems } = await filterRankingData({
          items: pageItems
        })

        allItems = allItems.concat(filteredItems)
        currentPage++
      }

      // 100件に制限してランク番号を再割り当て
      allItems = allItems.slice(0, targetCount).map((item, index) => ({
        ...item,
        rank: (page - 1) * targetCount + index + 1
      }))

      // 人気度に基づいた動的TTLを取得
      const ttl = await getTagCacheTTL(genre, tag)
      
      // KVにキャッシュ
      await kv.set(cacheKey, allItems, { ex: ttl })

      const response = NextResponse.json(allItems)
      response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
      response.headers.set('X-Cache-Status', 'MISS')
      response.headers.set('X-Cache-TTL', ttl.toString())
      return response
    }

    // 通常のランキングの場合（キャッシュミスはcronジョブの遅延を意味）
    const { items, popularTags } = await fetchRankingWithRetry(
      genre as RankingGenre,
      period as RankingPeriod
    )

    // NGフィルタリングを適用
    const { items: filteredItems } = await filterRankingData({ items })

    const data = { items: filteredItems, popularTags }

    // KVにキャッシュ（1時間TTL）
    await kv.set(cacheKey, data, { ex: 3600 })

    const response = NextResponse.json(data)
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
    response.headers.set('X-Cache-Status', 'MISS')
    return response

  } catch (error) {
    console.error('[API] Error:', error)
    
    // エラー時でもキャッシュがあれば古いデータを返す
    const staleCache = await kv.get(cacheKey)
    if (staleCache) {
      console.log(`[API] Returning stale cache for ${cacheKey} due to error`)
      const response = NextResponse.json(staleCache)
      response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
      response.headers.set('X-Cache-Status', 'STALE')
      return response
    }

    return NextResponse.json(
      { error: 'Failed to fetch ranking data' },
      { status: 500 }
    )
  }
}