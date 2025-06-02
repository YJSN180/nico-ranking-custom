import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { fetchRankingWithRetry } from '@/lib/complete-hybrid-scraper'
import { filterRankingData } from '@/lib/ng-filter'
import { trackTagUsage, getTagCacheTTL } from '@/lib/tag-popularity-tracker'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'

export const runtime = 'nodejs'

// タグの人気度に応じて最大ページ数を決定
async function getMaxPagesForTag(genre: string, tag: string): Promise<number> {
  const popularTags = await kv.get(`popular-tags-${genre}`) as string[] || []
  const rank = popularTags.indexOf(tag) + 1
  
  if (rank > 0 && rank <= 10) return 5  // Top 10: 500件まで
  if (rank > 10 && rank <= 20) return 3 // Top 11-20: 300件まで
  return 2                               // その他: 200件まで
}

// 次ページの先読み（非ブロッキング）
async function prefetchNextPage(
  genre: string, 
  period: string, 
  tag: string, 
  nextPage: number
): Promise<void> {
  // 非同期で実行（結果を待たない）
  setTimeout(async () => {
    try {
      const cacheKey = `ranking-${genre}-${period}-tag-${tag}-page${nextPage}`
      const cached = await kv.get(cacheKey)
      
      if (!cached) {
        console.log(`[Prefetch] Fetching page ${nextPage} for ${genre}/${tag}`)
        const { items } = await fetchRankingWithRetry(
          genre as RankingGenre,
          period as RankingPeriod,
          tag,
          100,
          nextPage
        )
        
        const { items: filteredItems } = await filterRankingData({ items })
        const ttl = await getTagCacheTTL(genre, tag)
        
        await kv.set(cacheKey, filteredItems, { ex: ttl })
      }
    } catch (error) {
      console.error(`[Prefetch] Error prefetching page ${nextPage}:`, error)
    }
  }, 0)
}

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
    // タグランキングの場合（統一された動的取得）
    if (tag) {
      // タグ使用統計を記録
      await trackTagUsage(genre, tag)
      
      // 最大ページ数をチェック
      const maxPages = await getMaxPagesForTag(genre, tag)
      if (page > maxPages) {
        return NextResponse.json(
          { 
            error: 'ページ制限を超えています',
            maxPages,
            message: `このタグは最大${maxPages}ページ（${maxPages * 100}件）まで表示可能です`
          },
          { status: 400 }
        )
      }
      
      // キャッシュキー
      const cacheKey = `ranking-${genre}-${period}-tag-${tag}-page${page}`
      
      // キャッシュチェック
      const cached = await kv.get(cacheKey)
      if (cached) {
        console.log(`[API] Cache hit for ${cacheKey}`)
        
        // 次ページの先読み（最初の3ページまで）
        if (page < Math.min(3, maxPages)) {
          prefetchNextPage(genre, period, tag, page + 1)
        }
        
        const response = NextResponse.json(cached)
        response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
        response.headers.set('X-Cache-Status', 'HIT')
        response.headers.set('X-Max-Pages', maxPages.toString())
        return response
      }
      
      console.log(`[API] Cache miss for ${cacheKey}, fetching...`)
      
      // NGフィルタリング後に100件確保
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
        
        if (!pageItems || pageItems.length === 0) break
        
        const { items: filteredItems } = await filterRankingData({ items: pageItems })
        allItems = allItems.concat(filteredItems)
        currentPage++
      }
      
      // 100件に制限してランク番号を再割り当て
      allItems = allItems.slice(0, targetCount).map((item, index) => ({
        ...item,
        rank: (page - 1) * targetCount + index + 1
      }))
      
      // 動的TTL
      const ttl = await getTagCacheTTL(genre, tag)
      
      // キャッシュに保存
      await kv.set(cacheKey, allItems, { ex: ttl })
      
      // 次ページの先読み
      if (page < Math.min(3, maxPages) && allItems.length === targetCount) {
        prefetchNextPage(genre, period, tag, page + 1)
      }
      
      const response = NextResponse.json(allItems)
      response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
      response.headers.set('X-Cache-Status', 'MISS')
      response.headers.set('X-Cache-TTL', ttl.toString())
      response.headers.set('X-Max-Pages', maxPages.toString())
      return response
    }
    
    // 通常のジャンル別ランキング（事前キャッシュから配信）
    const cacheKey = `ranking-${genre}-${period}`
    const cached = await kv.get(cacheKey)
    
    if (cached) {
      console.log(`[API] Cache hit for ${cacheKey}`)
      const response = NextResponse.json(cached)
      response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
      response.headers.set('X-Cache-Status', 'HIT')
      return response
    }
    
    // キャッシュミス時はフォールバック
    console.log(`[API] Cache miss for ${cacheKey}, fetching fresh data...`)
    const { items, popularTags } = await fetchRankingWithRetry(
      genre as RankingGenre,
      period as RankingPeriod
    )
    
    const { items: filteredItems } = await filterRankingData({ items })
    const data = { items: filteredItems, popularTags }
    
    await kv.set(cacheKey, data, { ex: 3600 })
    
    const response = NextResponse.json(data)
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
    response.headers.set('X-Cache-Status', 'MISS')
    return response
    
  } catch (error) {
    console.error('[API] Error:', error)
    
    // エラー時のフォールバック
    if (tag) {
      return NextResponse.json(
        { error: 'ランキングデータの取得に失敗しました', items: [] },
        { status: 200 } // 200で空配列を返す（エラー表示を避ける）
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch ranking data' },
      { status: 500 }
    )
  }
}