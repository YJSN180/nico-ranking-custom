import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import type { RankingData } from '@/types/ranking'
import type { RankingPeriod, RankingGenre } from '@/types/ranking-config'
import { scrapeRankingPage } from '@/lib/scraper'
import { getMockRankingData } from '@/lib/mock-data'

export const runtime = 'nodejs' // Edge RuntimeではなくNode.jsを使用

// キャッシュキーを生成
function getCacheKey(genre: RankingGenre, tag?: string): string {
  if (tag) {
    return `ranking-${genre}-tag-${encodeURIComponent(tag)}`
  }
  return `ranking-${genre}`
}

export async function GET(request: Request | NextRequest) {
  try {
    // URLパラメータを取得
    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || '24h') as RankingPeriod
    const genre = (searchParams.get('genre') || 'all') as RankingGenre
    const tag = searchParams.get('tag') || undefined
    
    const cacheKey = getCacheKey(genre, tag)
    
    // KVからキャッシュを確認
    const cachedData = await kv.get(cacheKey)
    
    if (cachedData) {
      // データ構造を確認: { items: RankingData, popularTags?: string[] } または RankingData
      if (typeof cachedData === 'object') {
        if ('items' in cachedData && Array.isArray(cachedData.items)) {
          // cron jobが保存した形式 - オブジェクト全体を返す（人気タグを含む）
          return NextResponse.json(cachedData, {
            headers: {
              'Cache-Control': 's-maxage=30, stale-while-revalidate=30',
            },
          })
        } else if (Array.isArray(cachedData)) {
          // 直接配列形式（後方互換性のため）
          return NextResponse.json(cachedData, {
            headers: {
              'Cache-Control': 's-maxage=30, stale-while-revalidate=30',
            },
          })
        } else {
          return fetchAndCacheRanking(period, genre, cacheKey, tag)
        }
      } else if (typeof cachedData === 'string') {
        try {
          const parsed = JSON.parse(cachedData)
          if ('items' in parsed && Array.isArray(parsed.items)) {
            // オブジェクト形式
            return NextResponse.json(parsed, {
              headers: {
                'Cache-Control': 's-maxage=30, stale-while-revalidate=30',
              },
            })
          } else if (Array.isArray(parsed)) {
            // 配列形式
            return NextResponse.json(parsed, {
              headers: {
                'Cache-Control': 's-maxage=30, stale-while-revalidate=30',
              },
            })
          } else {
            return fetchAndCacheRanking(period, genre, cacheKey, tag)
          }
        } catch {
          return fetchAndCacheRanking(period, genre, cacheKey, tag)
        }
      } else {
        return fetchAndCacheRanking(period, genre, cacheKey, tag)
      }
    }
    
    // キャッシュがない場合は新しくフェッチ
    return fetchAndCacheRanking(period, genre, cacheKey, tag)
    
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
  tag?: string
): Promise<NextResponse> {
  try {
    // スクレイピングベースの統一されたランキング取得
    // periodは現在24hのみサポート
    const { items: rankingData, popularTags } = await scrapeRankingPage(genre, period, tag)
    
    const items = rankingData.map((item) => ({
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
    })).filter(item => item.id && item.title)
    
    if (items.length > 0) {
      // KVにキャッシュ（タグ付きは短めのTTL）
      const ttl = tag ? 900 : 3600 // タグ: 15分、通常: 1時間
      const responseData = tag ? items : { items, popularTags }
      await kv.set(cacheKey, responseData, { ex: ttl })
      
      return NextResponse.json(responseData, {
        headers: {
          'Cache-Control': 's-maxage=30, stale-while-revalidate=30',
        },
      })
    }
  } catch (error) {
    // エラー時はモックデータを返す
    const mockData = getMockRankingData()
    return NextResponse.json(mockData, {
      headers: {
        'Cache-Control': 's-maxage=30, stale-while-revalidate=30',
        'X-Data-Source': 'mock',
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