import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import type { RankingData } from '@/types/ranking'
import type { RankingPeriod, RankingGenre } from '@/types/ranking-config'
import { fetchNicoRanking } from '@/lib/fetch-rss'
import { fetchVideoInfoBatch, fetchTagRanking } from '@/lib/nico-api'
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
    let rankingData: RankingData = []
    
    if (tag) {
      // タグが指定されている場合は、Snapshot APIから直接タグランキングを取得
      const tagRanking = await fetchTagRanking(tag, genre === 'all' ? undefined : genre, period)
      
      // TagRankingItem[]をRankingData形式に変換
      rankingData = tagRanking.map(item => ({
        rank: item.rank,
        id: item.contentId,
        title: item.title,
        thumbURL: item.thumbnail.largeUrl || item.thumbnail.url,
        views: item.viewCounter,
        comments: item.commentCounter,
        mylists: item.mylistCounter,
        likes: item.likeCounter
      }))
    } else {
      // タグが指定されていない場合は従来のRSSフィードからランキングを取得
      const rankingItems = await fetchNicoRanking(period, genre)
      
      if (rankingItems.length > 0) {
        // 動画IDのリストを作成
        const contentIds = rankingItems.map(item => item.id)
        
        // Snapshot APIから詳細情報を取得
        const videoInfoMap = await fetchVideoInfoBatch(contentIds)
        
        // ランキングデータに詳細情報を統合
        rankingData = rankingItems.map(item => {
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
      }
    }
    
    if (rankingData.length > 0) {
      // KVにキャッシュ（TTLは期間によって調整、タグランキングは短めに）
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