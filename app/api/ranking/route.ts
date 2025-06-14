import { NextRequest, NextResponse } from 'next/server'
import { getGenreRanking, getTagRanking } from '@/lib/cloudflare-kv'
import { fetchRanking } from '@/lib/complete-hybrid-scraper'
import { filterRankingDataServer, filterRankingItemsServer } from '@/lib/ng-filter-server'
import { addToServerDerivedNGList } from '@/lib/ng-list-server'
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
          // Cloudflare KV error - silently fallback to dynamic fetch
          // Cloudflare KVが利用できない場合は動的取得にフォールバック
        }
      }
      
      // キャッシュミス時は動的取得
      // console.log(`[API] Cache miss for ${cacheKey}, fetching...`)
      
      // NGフィルタリング後に500件確保（通常のジャンルと同じ）
      const targetCount = 500
      let allItems: any[] = []
      let currentPage = page
      const maxAttempts = 10
      
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
        
        // NGフィルタリング（タグ別ランキング）
        const tagFilterResult = await filterRankingItemsServer(completeItems)
        const filteredItems = tagFilterResult.filteredItems
        
        // 新しく見つかったNG動画IDを派生リストに追加
        if (tagFilterResult.newDerivedIds.length > 0) {
          try {
            await addToServerDerivedNGList(tagFilterResult.newDerivedIds)
            if (process.env.NODE_ENV === 'production') {
              // eslint-disable-next-line no-console
              console.log(`[NG] Added ${tagFilterResult.newDerivedIds.length} new derived NG IDs from tag ranking ${genre}-${period}-${tag}`)
            }
          } catch (error) {
            console.error(`[NG] Failed to add derived NG IDs:`, error)
          }
        }
        allItems = allItems.concat(filteredItems)
        currentPage++
      }
      
      // ランク番号を再割り当て（ページネーション対応）
      const itemsPerPage = 100
      const startIdx = (page - 1) * itemsPerPage
      const endIdx = page * itemsPerPage
      const pageItems = allItems.slice(startIdx, endIdx).map((item, index) => ({
        ...item,
        rank: startIdx + index + 1
      }))
      
      // 動的取得の場合はキャッシュなし（Cloudflare KVのみ使用）
      
      const response = NextResponse.json({
        items: pageItems,
        hasMore: endIdx < allItems.length, // 次のページにアイテムがあるか
        totalCached: allItems.length // 取得した総数
      })
      response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
      response.headers.set('X-Cache-Status', 'MISS')
      return response
    }

    // 通常のジャンル別ランキング
    
    // Cloudflare KVからの取得を試みる（ページ1-5、500件まで）
    if (useCloudflareKV && page <= 5) {
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
              popularTags: cfData.popularTags || [],
              hasMore: cfData.items.length > 100,
              totalCached: cfData.items.length
            })
            response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
            response.headers.set('X-Cache-Status', 'CF-HIT')
            response.headers.set('X-Max-Items', '500')
            return response
          } else {
            // ページ2以降も統一された形式で返す
            const response = NextResponse.json({
              items: pageItems,
              hasMore: endIdx < cfData.items.length,
              totalCached: cfData.items.length
            })
            response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
            response.headers.set('X-Cache-Status', 'CF-HIT')
            response.headers.set('X-Max-Items', '500')
            return response
          }
        }
      } catch (error) {
        // Cloudflare KV error - silently fallback to dynamic fetch
        // Cloudflare KVが利用できない場合は動的取得にフォールバック
      }
    }
    
    // ページ番号が6以上の場合（501位以降）は動的取得
    if (page >= 6) {
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
      
      // NGフィルタリング（ページ6以降の動的取得）
      const pageFilterResult = await filterRankingItemsServer(completeItems)
      const filteredItems = pageFilterResult.filteredItems
      
      // 新しく見つかったNG動画IDを派生リストに追加
      if (pageFilterResult.newDerivedIds.length > 0) {
        try {
          await addToServerDerivedNGList(pageFilterResult.newDerivedIds)
          if (process.env.NODE_ENV === 'production') {
            // eslint-disable-next-line no-console
            console.log(`[NG] Added ${pageFilterResult.newDerivedIds.length} new derived NG IDs from page ${page} ranking ${genre}-${period}`)
          }
        } catch (error) {
          console.error(`[NG] Failed to add derived NG IDs:`, error)
        }
      }
      
      // ランク番号を調整
      const adjustedItems = filteredItems.map((item, index) => ({
        ...item,
        rank: (page - 1) * 100 + index + 1
      }))
      
      // 統一された形式で返す
      const response = NextResponse.json({
        items: adjustedItems,
        hasMore: adjustedItems.length === 100, // 100件取得できたら次のページがある可能性
        totalCached: 0 // 動的取得の場合は未知
      })
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
    
    // NGフィルタリング（動的取得フォールバック）
    const fallbackFilterResult = await filterRankingItemsServer(completeItems)
    const filteredItems = fallbackFilterResult.filteredItems
    
    // 新しく見つかったNG動画IDを派生リストに追加
    if (fallbackFilterResult.newDerivedIds.length > 0) {
      try {
        await addToServerDerivedNGList(fallbackFilterResult.newDerivedIds)
        if (process.env.NODE_ENV === 'production') {
          // eslint-disable-next-line no-console
          console.log(`[NG] Added ${fallbackFilterResult.newDerivedIds.length} new derived NG IDs from fallback ranking ${genre}-${period}`)
        }
      } catch (error) {
        console.error(`[NG] Failed to add derived NG IDs:`, error)
      }
    }
    
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
    
    // 統一された形式で返す
    const response = NextResponse.json({
      items: pageItems,
      hasMore: endIdx < filteredItems.length,
      totalCached: filteredItems.length
    })
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
    response.headers.set('X-Cache-Status', 'MISS')
    response.headers.set('X-Max-Items', '500')
    return response
    
  } catch (error) {
    // API error - return error response
    return NextResponse.json(
      { error: 'Failed to fetch ranking data' },
      { status: 500 }
    )
  }
}