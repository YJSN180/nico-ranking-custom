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
      let rankingData: RankingData
      
      // データ構造を確認: { items: RankingData, popularTags?: string[] } または RankingData
      if (typeof cachedData === 'object') {
        if ('items' in cachedData && Array.isArray(cachedData.items)) {
          // cron jobが保存した形式
          rankingData = cachedData.items as RankingData
        } else if (Array.isArray(cachedData)) {
          // 直接配列形式
          rankingData = cachedData as RankingData
        } else {
          return fetchAndCacheRanking(period, genre, cacheKey, tag)
        }
      } else if (typeof cachedData === 'string') {
        try {
          const parsed = JSON.parse(cachedData)
          if ('items' in parsed && Array.isArray(parsed.items)) {
            rankingData = parsed.items as RankingData
          } else if (Array.isArray(parsed)) {
            rankingData = parsed as RankingData
          } else {
            return fetchAndCacheRanking(period, genre, cacheKey, tag)
          }
        } catch {
          return fetchAndCacheRanking(period, genre, cacheKey, tag)
        }
      } else {
        return fetchAndCacheRanking(period, genre, cacheKey, tag)
      }
      
      return NextResponse.json(rankingData, {
        headers: {
          'Cache-Control': 's-maxage=30, stale-while-revalidate=30',
        },
      })
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
    const { items: rankingData } = await scrapeRankingPage(genre, period, tag)
    
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
      await kv.set(cacheKey, items, { ex: ttl })
      
      return NextResponse.json(items, {
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