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
            // タグ別ランキングは最大300件まで
            const maxTagItems = 300
            const items = cfItems.slice(0, maxTagItems)
            const response = NextResponse.json({
              items: items,
              hasMore: false,
              totalCached: cfItems.length
            })
            response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
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
      
      // NGフィルタリング後に300件確保（タグ別ランキングの現実的な上限）
      const targetCount = 300
      let allItems: any[] = []
      let currentPage = 1
      const maxAttempts = 10
      
      while (allItems.length < targetCount && currentPage <= maxAttempts) {
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
      
      // タグ別ランキングは300件すべてを返す（ページネーションなし）
      const rerankedItems = allItems.map((item, index) => ({
        ...item,
        rank: index + 1
      }))
      
      // 動的取得の場合はキャッシュなし（Cloudflare KVのみ使用）
      
      const response = NextResponse.json({
        items: rerankedItems, // 全件返す（最大300件）
        hasMore: false, // タグ別ランキングはページネーションなし
        totalCached: rerankedItems.length // 取得した総数
      })
      response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
      response.headers.set('X-Cache-Status', 'MISS')
      return response
    }

    // 通常のジャンル別ランキング
    
    // Cloudflare KVからの取得を試みる
    if (useCloudflareKV) {
      try {
        const cfData = await getGenreRanking(genre, period as RankingPeriod)
        if (cfData && cfData.items && cfData.items.length > 0) {
          // ジャンル別ランキングは500件まで返す
          const maxItems = 500
          const items = cfData.items.slice(0, maxItems)
          
          const response = NextResponse.json({
            items: items,
            popularTags: cfData.popularTags || [],
            hasMore: false, // ページネーションなし
            totalCached: cfData.items.length
          })
          response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
          response.headers.set('X-Cache-Status', 'CF-HIT')
          response.headers.set('X-Max-Items', String(maxItems))
          return response
        }
      } catch (error) {
        // Cloudflare KV error - silently fallback to dynamic fetch
        // Cloudflare KVが利用できない場合は動的取得にフォールバック
      }
    }
    
    // 動的取得にフォールバック
    const { items: dynamicItems } = await scrapeRankingPage(
      genre,
      period as RankingPeriod,
      undefined,
      500 // 最大500件取得
    )
    
    // Convert Partial<RankingItem>[] to RankingItem[]
    const completeItems: RankingItem[] = dynamicItems
      .filter((item): item is RankingItem => 
        item.rank !== undefined &&
        item.id !== undefined &&
        item.title !== undefined &&
        item.thumbURL !== undefined &&
        item.views !== undefined
      )
    
    // NGフィルタリング
    const filterResult = await filterRankingItemsServer(completeItems)
    const filteredItems = filterResult.filteredItems
    
    // 新しく見つかったNG動画IDを派生リストに追加
    if (filterResult.newDerivedIds.length > 0) {
      try {
        await addToServerDerivedNGList(filterResult.newDerivedIds)
        if (process.env.NODE_ENV === 'production') {
          // eslint-disable-next-line no-console
          console.log(`[NG] Added ${filterResult.newDerivedIds.length} new derived NG IDs from dynamic fetch ${genre}-${period}`)
        }
      } catch (error) {
        console.error(`[NG] Failed to add derived NG IDs:`, error)
      }
    }
    
    const response = NextResponse.json({
      items: filteredItems,
      popularTags: [],
      hasMore: false,
      totalCached: filteredItems.length
    })
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    response.headers.set('X-Cache-Status', 'DYNAMIC')
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