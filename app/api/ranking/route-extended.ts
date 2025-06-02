import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { fetchRankingWithRetry } from '@/lib/complete-hybrid-scraper'
import { filterRankingData } from '@/lib/ng-filter'
import { trackTagUsage } from '@/lib/tag-popularity-tracker'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'

export const runtime = 'nodejs'

// キャッシュキーの生成
function getCacheKey(genre: string, period: string, tag?: string): string {
  if (tag) {
    return `ranking-${genre}-${period}-tag-${encodeURIComponent(tag)}`
  }
  return `ranking-${genre}-${period}`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const genre = searchParams.get('genre') || 'all'
  const period = searchParams.get('period') || '24h'
  const tag = searchParams.get('tag') || undefined
  const page = parseInt(searchParams.get('page') || '1', 10)

  // Validate inputs
  const validGenres = ['all', 'game', 'entertainment', 'other', 'tech', 'anime', 'voicesynthesis']
  const validPeriods = ['24h', 'hour']
  
  if (!validGenres.includes(genre) || !validPeriods.includes(period)) {
    return NextResponse.json({ error: 'Invalid genre or period' }, { status: 400 })
  }

  try {
    // タグ使用統計を記録（人気度追跡のため）
    if (tag) {
      await trackTagUsage(genre, tag)
    }

    // タグ別ランキングの場合
    if (tag) {
      const cacheKey = page > 1 
        ? `${getCacheKey(genre, period, tag)}-page${page}`
        : getCacheKey(genre, period, tag)
      
      // キャッシュチェック
      const cached = await kv.get(cacheKey)
      
      if (cached) {
        console.log(`[API] Cache hit for ${cacheKey}`)
        const response = NextResponse.json(cached)
        response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
        response.headers.set('X-Cache-Status', 'HIT')
        return response
      }
      
      // キャッシュミス時は動的取得
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
      
      // キャッシュに保存（1時間TTL）
      await kv.set(cacheKey, allItems, { ex: 3600 })
      
      const response = NextResponse.json(allItems)
      response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
      response.headers.set('X-Cache-Status', 'MISS')
      return response
    }

    // 通常のジャンル別ランキング
    // ページ番号が4以上の場合（301位以降）は動的取得
    if (page >= 4) {
      console.log(`[API] Fetching page ${page} for ${genre}/${period} (dynamic)`)
      
      // 100件単位で動的取得
      const { items: pageItems } = await fetchRankingWithRetry(
        genre as RankingGenre,
        period as RankingPeriod,
        undefined,
        100,
        page
      )
      
      // NGフィルタリング
      const { items: filteredItems } = await filterRankingData({ items: pageItems })
      
      // ランク番号を調整
      const adjustedItems = filteredItems.map((item, index) => ({
        ...item,
        rank: (page - 1) * 100 + index + 1
      }))
      
      const response = NextResponse.json(adjustedItems)
      response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
      response.headers.set('X-Cache-Status', 'DYNAMIC')
      response.headers.set('X-Max-Items', '500')
      return response
    }
    
    // 1-3ページ（1-300位）は事前キャッシュから配信
    const cacheKey = getCacheKey(genre, period)
    const cachedData = await kv.get(cacheKey)
    
    if (cachedData) {
      console.log(`[API] Cache hit for ${cacheKey}`)
      
      // キャッシュデータの構造を確認
      if (typeof cachedData === 'object' && 'items' in cachedData && Array.isArray(cachedData.items)) {
        // ページ番号に応じてスライス
        const startIdx = (page - 1) * 100
        const endIdx = page * 100
        const pageItems = cachedData.items.slice(startIdx, endIdx)
        
        // ページ1の場合は人気タグも含めて返す
        if (page === 1) {
          const response = NextResponse.json({
            items: pageItems,
            popularTags: cachedData.popularTags || []
          })
          response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
          response.headers.set('X-Cache-Status', 'HIT')
          response.headers.set('X-Max-Items', '500')
          return response
        } else {
          // ページ2以降はアイテムのみ
          const response = NextResponse.json(pageItems)
          response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
          response.headers.set('X-Cache-Status', 'HIT')
          response.headers.set('X-Max-Items', '500')
          return response
        }
      }
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
    
    // ページ1の場合
    if (page === 1) {
      const response = NextResponse.json({
        items: filteredItems.slice(0, 100),
        popularTags
      })
      response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
      response.headers.set('X-Cache-Status', 'MISS')
      response.headers.set('X-Max-Items', '500')
      return response
    }
    
    // ページ2-3の場合
    const startIdx = (page - 1) * 100
    const endIdx = page * 100
    const pageItems = filteredItems.slice(startIdx, endIdx)
    
    const response = NextResponse.json(pageItems)
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
    response.headers.set('X-Cache-Status', 'MISS')
    response.headers.set('X-Max-Items', '500')
    return response
    
  } catch (error) {
    console.error('[API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ranking data' },
      { status: 500 }
    )
  }
}