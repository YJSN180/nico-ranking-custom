import { NextRequest, NextResponse } from 'next/server'
import { getGenreRanking, getTagRanking } from '@/lib/cloudflare-kv'
import { fetchRanking } from '@/lib/complete-hybrid-scraper'
import { filterRankingData } from '@/lib/ng-filter'
import { scrapeRankingPage } from '@/lib/scraper'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import type { RankingItem } from '@/types/ranking'

export const runtime = 'nodejs'

// Cloudflare KVのみ使用するため、getCacheKey関数は削除

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const genre = searchParams.get('genre') || 'all'
  const period = searchParams.get('period') || '24h'
  const tag = searchParams.get('tag') || undefined
  const page = parseInt(searchParams.get('page') || '1', 10)

  // Validate inputs - period のみチェック（genreはすべて受け入れる）
  const validPeriods = ['24h', 'hour']
  
  if (!validPeriods.includes(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }

  try {
    // Cloudflare KVが利用可能かチェック（環境変数で判定）
    const useCloudflareKV = process.env.CLOUDFLARE_KV_NAMESPACE_ID ? true : false
    
    // タグ別ランキングの処理
    if (tag) {
      // Cloudflare KVからの取得を試みる
      if (useCloudflareKV) {
        try {
          const cfItems = await getTagRanking(genre, period as RankingPeriod, tag)
          if (cfItems && cfItems.length > 0) {
            // ページネーション処理
            const itemsPerPage = 100
            const startIdx = (page - 1) * itemsPerPage
            const endIdx = page * itemsPerPage
            const pageItems = cfItems.slice(startIdx, endIdx)
            const hasMore = endIdx < cfItems.length
            
            const response = NextResponse.json({
              items: pageItems,
              hasMore,
              totalCached: cfItems.length
            })
            response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
            response.headers.set('X-Cache-Status', 'CF-HIT')
            response.headers.set('X-Total-Cached', cfItems.length.toString())
            return response
          }
        } catch (error) {
          console.error('[API] Cloudflare KV error:', error)
          // Cloudflare KVが利用できない場合は動的取得にフォールバック
        }
      }
      
      // キャッシュミス時は動的取得
      // console.log(`[API] Cache miss for ${cacheKey}, fetching...`)
      
      // NGフィルタリング後に100件確保
      const targetCount = 100
      let allItems: any[] = []
      let currentPage = page
      const maxAttempts = 3
      
      while (allItems.length < targetCount && currentPage < page + maxAttempts) {
        const { items: pageItems } = await scrapeRankingPage(
          genre,
          period as RankingPeriod,
          tag,
          100,
          currentPage
        )
        
        if (!pageItems || pageItems.length === 0) break
        
        // Convert Partial<RankingItem>[] to RankingItem[]
        const completeItems: RankingItem[] = pageItems
          .filter((item): item is RankingItem => 
            item.rank !== undefined &&
            item.id !== undefined &&
            item.title !== undefined &&
            item.thumbURL !== undefined &&
            item.views !== undefined
          )
        
        const { items: filteredItems } = await filterRankingData({ items: completeItems })
        allItems = allItems.concat(filteredItems)
        currentPage++
      }
      
      // 100件に制限してランク番号を再割り当て
      allItems = allItems.slice(0, targetCount).map((item, index) => ({
        ...item,
        rank: (page - 1) * targetCount + index + 1
      }))
      
      // 動的取得の場合はキャッシュなし（Cloudflare KVのみ使用）
      
      const response = NextResponse.json({
        items: allItems,
        hasMore: allItems.length >= targetCount, // 100件取れたら次のページがある可能性
        totalCached: 0 // 動的取得の場合は総数不明
      })
      response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
      response.headers.set('X-Cache-Status', 'MISS')
      return response
    }

    // 通常のジャンル別ランキング
    
    // Cloudflare KVからの取得を試みる（ページ1-3）
    if (useCloudflareKV && page <= 3) {
      try {
        const cfData = await getGenreRanking(genre, period as RankingPeriod)
        if (cfData && cfData.items && cfData.items.length > 0) {
          // ページネーション処理
          const startIdx = (page - 1) * 100
          const endIdx = page * 100
          const pageItems = cfData.items.slice(startIdx, endIdx)
          
          // ページ1の場合は人気タグも含めて返す
          if (page === 1) {
            const response = NextResponse.json({
              items: pageItems,
              popularTags: cfData.popularTags || []
            })
            response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
            response.headers.set('X-Cache-Status', 'CF-HIT')
            response.headers.set('X-Max-Items', '500')
            return response
          } else {
            // ページ2以降はアイテムのみ
            const response = NextResponse.json(pageItems)
            response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
            response.headers.set('X-Cache-Status', 'CF-HIT')
            response.headers.set('X-Max-Items', '500')
            return response
          }
        }
      } catch (error) {
        console.error('[API] Cloudflare KV error:', error)
        // Cloudflare KVが利用できない場合は動的取得にフォールバック
      }
    }
    
    // ページ番号が4以上の場合（301位以降）は動的取得
    if (page >= 4) {
      // console.log(`[API] Fetching page ${page} for ${genre}/${period} (dynamic)`)
      
      // 100件単位で動的取得
      const { items: pageItems } = await scrapeRankingPage(
        genre,
        period as RankingPeriod,
        undefined,
        100,
        page
      )
      
      // Convert Partial<RankingItem>[] to RankingItem[]
      const completeItems: RankingItem[] = pageItems
        .filter((item): item is RankingItem => 
          item.rank !== undefined &&
          item.id !== undefined &&
          item.title !== undefined &&
          item.thumbURL !== undefined &&
          item.views !== undefined
        )
      
      // NGフィルタリング
      const { items: filteredItems } = await filterRankingData({ items: completeItems })
      
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
    
    // Cloudflare KVが利用できない場合、またはキャッシュミス時は動的取得
    // console.log(`[API] Cache miss for ${cacheKey}, fetching fresh data...`)
    const { items, popularTags } = await scrapeRankingPage(
      genre,
      period as RankingPeriod
    )
    
    // Convert Partial<RankingItem>[] to RankingItem[]
    const completeItems: RankingItem[] = items
      .filter((item): item is RankingItem => 
        item.rank !== undefined &&
        item.id !== undefined &&
        item.title !== undefined &&
        item.thumbURL !== undefined &&
        item.views !== undefined
      )
    
    const { items: filteredItems } = await filterRankingData({ items: completeItems })
    const data = { items: filteredItems, popularTags }
    
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