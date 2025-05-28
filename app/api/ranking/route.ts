import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import type { RankingData } from '@/types/ranking'
import type { RankingPeriod, RankingGenre } from '@/types/ranking-config'
import { fetchRankingData } from '@/lib/fetch-ranking'
import { getMockRankingData } from '@/lib/mock-data'

export const runtime = 'nodejs' // Edge RuntimeではなくNode.jsを使用

// キャッシュキーを生成
function getCacheKey(period: RankingPeriod, genre: RankingGenre, tag?: string): string {
  if (tag) {
    return `ranking-tag-${period}-${genre}-${tag}`
  }
  return `ranking-${period}-${genre}`
}

export async function GET(request: Request | NextRequest) {
  try {
    // URLパラメータを取得
    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || '24h') as RankingPeriod
    const genre = (searchParams.get('genre') || 'all') as RankingGenre
    const tag = searchParams.get('tag') || undefined
    
    const cacheKey = getCacheKey(period, genre, tag)
    
    // KVからキャッシュを確認
    const cachedData = await kv.get(cacheKey)
    
    if (cachedData) {
      let rankingData: RankingData
      
      if (typeof cachedData === 'object' && Array.isArray(cachedData)) {
        rankingData = cachedData as RankingData
      } else if (typeof cachedData === 'string') {
        try {
          rankingData = JSON.parse(cachedData)
        } catch {
          // キャッシュが無効な場合は新しくフェッチ
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
    const rankingData = await fetchRankingData(period, genre, tag)
    
    if (rankingData.length > 0) {
      // KVにキャッシュ（TTLは期間によって調整）
      const ttl = tag ? 900 : (period === 'hour' ? 3600 : 1800) // タグ: 15分、毎時: 1時間、24時間: 30分
      await kv.set(cacheKey, rankingData, { ex: ttl })
      
      return NextResponse.json(rankingData, {
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