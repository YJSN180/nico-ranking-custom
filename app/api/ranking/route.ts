import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import type { RankingData } from '@/types/ranking'
import type { RankingPeriod, RankingGenre } from '@/types/ranking-config'
import { fetchNicoRanking } from '@/lib/fetch-rss'
import { fetchVideoInfoBatch } from '@/lib/nico-api'
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
    console.error('Error in ranking API:', error)
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
    // RSSフィードから基本的なランキング情報を取得
    const rankingItems = await fetchNicoRanking(period, genre, tag)
    
    if (rankingItems.length > 0) {
      // 動画IDのリストを作成
      const contentIds = rankingItems.map(item => item.id)
      
      // Snapshot APIから詳細情報を取得
      const videoInfoMap = await fetchVideoInfoBatch(contentIds)
      
      // ランキングデータに詳細情報を統合
      const enrichedRanking: RankingData = rankingItems.map(item => {
        const videoInfo = videoInfoMap.get(item.id)
        
        if (videoInfo) {
          return {
            ...item,
            views: videoInfo.viewCounter,
            comments: videoInfo.commentCounter,
            mylists: videoInfo.mylistCounter,
            likes: videoInfo.likeCounter,
            thumbURL: videoInfo.thumbnail.largeUrl || videoInfo.thumbnail.url || item.thumbURL
          }
        }
        
        // Snapshot APIから情報が取得できない場合はRSSの情報をそのまま使用
        return item
      })
      
      // KVにキャッシュ（TTLは期間によって調整）
      const ttl = period === 'hour' ? 3600 : 1800 // 毎時: 1時間、24時間: 30分
      await kv.set(cacheKey, enrichedRanking, { ex: ttl })
      
      return NextResponse.json(enrichedRanking, {
        headers: {
          'Cache-Control': 's-maxage=30, stale-while-revalidate=30',
        },
      })
    }
  } catch (error) {
    console.error('Error fetching ranking:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      period,
      genre,
      tag,
      cacheKey
    })
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