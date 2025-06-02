import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import type { RankingData } from '@/types/ranking'
import type { RankingPeriod, RankingGenre } from '@/types/ranking-config'
import { scrapeRankingPage } from '@/lib/scraper'
import { filterRankingData } from '@/lib/ng-filter'
// import { getMockRankingData } from '@/lib/mock-data' // モックデータは使用しない

export const runtime = 'nodejs' // Edge RuntimeではなくNode.jsを使用

// キャッシュキーを生成
function getCacheKey(genre: RankingGenre, period: RankingPeriod, tag?: string): string {
  if (tag) {
    return `ranking-${genre}-${period}-tag-${encodeURIComponent(tag)}`
  }
  return `ranking-${genre}-${period}`
}

export async function GET(request: Request | NextRequest) {
  try {
    // URLパラメータを取得
    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || '24h') as RankingPeriod
    const genre = (searchParams.get('genre') || 'all') as RankingGenre
    const tag = searchParams.get('tag') || undefined
    const page = parseInt(searchParams.get('page') || '1', 10)
    
    // タグ別ランキングの場合はページごとにキャッシュキーを分ける
    const cacheKey = tag && page > 1 
      ? `${getCacheKey(genre, period, tag)}-page${page}`
      : getCacheKey(genre, period, tag)
    
    // KVからキャッシュを確認
    const cachedData = await kv.get(cacheKey)
    
    if (cachedData) {
      // データ構造を確認: { items: RankingData, popularTags?: string[] } または RankingData
      if (typeof cachedData === 'object') {
        if ('items' in cachedData && Array.isArray(cachedData.items)) {
          // タグ別ランキングの場合は、キャッシュされたデータにもNGフィルタリングを適用
          if (tag) {
            const { items: filtered } = await filterRankingData({ items: cachedData.items })
            return NextResponse.json({ items: filtered }, {
              headers: {
                'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
              },
            })
          }
          // cron jobが保存した形式 - オブジェクト全体を返す（人気タグを含む）
          return NextResponse.json(cachedData, {
            headers: {
              'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
            },
          })
        } else if (Array.isArray(cachedData)) {
          // タグ別ランキングの場合は、配列形式のデータにもNGフィルタリングを適用
          if (tag) {
            const { items: filtered } = await filterRankingData({ items: cachedData })
            return NextResponse.json(filtered, {
              headers: {
                'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
              },
            })
          }
          // 直接配列形式（後方互換性のため）
          return NextResponse.json(cachedData, {
            headers: {
              'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
            },
          })
        } else {
          return fetchAndCacheRanking(period, genre, cacheKey, tag, page)
        }
      } else if (typeof cachedData === 'string') {
        try {
          const parsed = JSON.parse(cachedData)
          if ('items' in parsed && Array.isArray(parsed.items)) {
            // タグ別ランキングの場合は、オブジェクト形式のデータにもNGフィルタリングを適用
            if (tag) {
              const { items: filtered } = await filterRankingData({ items: parsed.items })
              return NextResponse.json({ items: filtered }, {
                headers: {
                  'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
                },
              })
            }
            // オブジェクト形式
            return NextResponse.json(parsed, {
              headers: {
                'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
              },
            })
          } else if (Array.isArray(parsed)) {
            // タグ別ランキングの場合は、配列形式のデータにもNGフィルタリングを適用
            if (tag) {
              const { items: filtered } = await filterRankingData({ items: parsed })
              return NextResponse.json(filtered, {
                headers: {
                  'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
                },
              })
            }
            // 配列形式
            return NextResponse.json(parsed, {
              headers: {
                'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
              },
            })
          } else {
            return fetchAndCacheRanking(period, genre, cacheKey, tag, page)
          }
        } catch {
          return fetchAndCacheRanking(period, genre, cacheKey, tag)
        }
      } else {
        return fetchAndCacheRanking(period, genre, cacheKey, tag, page)
      }
    }
    
    // キャッシュがない場合は新しくフェッチ
    return fetchAndCacheRanking(period, genre, cacheKey, tag, page)
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch ranking data' },
      { status: 502 }
    )
  }
}

async function fetchAndCacheRanking(
  period: RankingPeriod, 
  genre: RankingGenre, 
  cacheKey: string,
  tag?: string,
  page: number = 1
): Promise<NextResponse> {
  try {
    // タグ別ランキングの場合は、NGフィルタリング後100件を確保する
    let allItems: any[] = []
    let popularTags: string[] = []
    
    if (tag) {
      // タグ別ランキング: NGフィルタリング後100件を確保
      const targetCount = 100
      let currentPage = page
      const maxAttempts = 3 // 最大3回まで追加取得を試みる
      
      while (allItems.length < targetCount && currentPage < page + maxAttempts) {
        const { items: pageItems, popularTags: pageTags } = await scrapeRankingPage(genre, period, tag, 100, currentPage)
        
        if (currentPage === page && pageTags) {
          popularTags = pageTags
        }
        
        // マップして必要な形式に変換
        const mappedItems = pageItems.map((item: any) => ({
          rank: item.rank || 0,
          id: item.id || '',
          title: item.title || '',
          thumbURL: item.thumbURL || '',
          views: item.views || 0,
          comments: item.comments,
          mylists: item.mylists,
          likes: item.likes,
          tags: item.tags,
          authorId: item.authorId,
          authorName: item.authorName,
          authorIcon: item.authorIcon,
          registeredAt: item.registeredAt,
        })).filter((item: any) => item.id && item.title)
        
        // NGフィルタリングを適用
        const { items: filtered } = await filterRankingData({ items: mappedItems })
        allItems.push(...filtered)
        
        if (pageItems.length < 100) {
          // これ以上データがない
          break
        }
        
        currentPage++
      }
      
      // 100件に切り詰めてランク番号を振り直す
      allItems = allItems.slice(0, targetCount).map((item, index) => ({
        ...item,
        rank: (page - 1) * targetCount + index + 1
      }))
      
    } else {
      // 通常ランキング: 従来通り
      const { items: rankingData, popularTags: pageTags } = await scrapeRankingPage(genre, period, tag)
      allItems = rankingData
      popularTags = pageTags || []
    }
    
    // 通常ランキングの場合のみマッピングが必要
    const items = tag ? allItems : allItems.map((item: any) => ({
      rank: item.rank || 0,
      id: item.id || '',
      title: item.title || '',
      thumbURL: item.thumbURL || '',
      views: item.views || 0,
      comments: item.comments,
      mylists: item.mylists,
      likes: item.likes,
      tags: item.tags,
      authorId: item.authorId,
      authorName: item.authorName,
      authorIcon: item.authorIcon,
      registeredAt: item.registeredAt,
    })).filter((item: any) => item.id && item.title)
    
    if (items.length > 0) {
      // 通常ランキングの場合はNGフィルタリングを適用（タグ別は既に適用済み）
      let filteredItems = items
      if (!tag) {
        const { items: filtered } = await filterRankingData({ items })
        filteredItems = filtered
      }
      
      // KVにキャッシュ（タグ付きも1時間に延長）
      const ttl = 3600 // 1時間
      const responseData = tag ? filteredItems : { items: filteredItems, popularTags }
      await kv.set(cacheKey, responseData, { ex: ttl })
      
      return NextResponse.json(responseData, {
        headers: {
          'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
        },
      })
    }
  } catch (error) {
    // エラー時は空のデータを返す（モックデータは使用しない）
    return NextResponse.json({ items: [], popularTags: [] }, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
        'X-Data-Source': 'error',
        'X-Error': error instanceof Error ? error.message : 'Unknown error'
      },
    })
  }
  
  // データが取得できない場合
  return NextResponse.json(
    { 
      error: 'No ranking data available',
      message: 'データが準備されるまでお待ちください。'
    },
    { 
      status: 502,
      headers: {
        'Retry-After': '300',
      }
    }
  )
}