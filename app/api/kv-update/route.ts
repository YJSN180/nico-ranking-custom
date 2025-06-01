import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import type { RankingItem } from '@/types/ranking'
import type { RankingGenre } from '@/types/ranking-config'

export const runtime = 'edge'

interface UpdateData {
  genre: RankingGenre
  items: RankingItem[]
  popularTags: string[]
  scrapedAt?: string
}

interface BatchUpdateRequest {
  updates: UpdateData[]
}

// 認証チェック
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = request.headers.get('X-Cron-Secret')
  return cronSecret === process.env.CRON_SECRET
}

// 単一ジャンルの更新
async function updateSingleGenre(data: UpdateData): Promise<void> {
  const key = `ranking-${data.genre}`
  
  await kv.set(key, {
    items: data.items,
    popularTags: data.popularTags,
    updatedAt: new Date().toISOString(),
    scrapedAt: data.scrapedAt || new Date().toISOString()
  })
  
  // TTL: 1時間
  await kv.expire(key, 3600)
}

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    const isBatchUpdate = request.headers.get('X-Batch-Update') === 'true'
    
    if (isBatchUpdate) {
      // バッチ更新
      const { updates }: BatchUpdateRequest = await request.json()
      
      if (!Array.isArray(updates)) {
        return NextResponse.json(
          { error: 'Invalid batch data' },
          { status: 400 }
        )
      }
      
      const updated: string[] = []
      const failed: string[] = []
      
      // 各ジャンルを更新
      for (const data of updates) {
        try {
          // バリデーション
          if (!data.genre || !Array.isArray(data.items)) {
            failed.push(data.genre || 'unknown')
            continue
          }
          
          await updateSingleGenre(data)
          updated.push(data.genre)
        } catch (error) {
          console.error(`Failed to update ${data.genre}:`, error)
          failed.push(data.genre)
        }
      }
      
      return NextResponse.json({
        success: true,
        updated,
        failed,
        timestamp: new Date().toISOString()
      })
      
    } else {
      // 単一更新
      const data: UpdateData = await request.json()
      
      // バリデーション
      if (!data.genre || !Array.isArray(data.items)) {
        return NextResponse.json(
          { error: 'Invalid data: genre and items are required' },
          { status: 400 }
        )
      }
      
      await updateSingleGenre(data)
      
      return NextResponse.json({
        success: true,
        genre: data.genre,
        itemCount: data.items.length,
        popularTagsCount: data.popularTags?.length || 0,
        timestamp: new Date().toISOString()
      })
    }
    
  } catch (error) {
    console.error('KV update error:', error)
    
    if (error instanceof Error && error.message.includes('KV')) {
      return NextResponse.json(
        { error: 'KV update failed', details: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// 現在のKVデータを確認（デバッグ用）
export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    const genre = request.nextUrl.searchParams.get('genre')
    
    if (genre) {
      // 特定ジャンルのデータを取得
      const key = `ranking-${genre}`
      const data = await kv.get(key)
      
      if (!data) {
        return NextResponse.json(
          { error: 'Data not found', genre },
          { status: 404 }
        )
      }
      
      return NextResponse.json({
        genre,
        data,
        ttl: await kv.ttl(key)
      })
    } else {
      // 全ジャンルの概要
      const genres: RankingGenre[] = [
        'all', 'game', 'anime', 'vocaloid', 'voicesynthesis', 'entertainment',
        'music', 'sing', 'dance', 'play', 'commentary', 'cooking', 'travel',
        'nature', 'vehicle', 'technology', 'society', 'mmd', 'vtuber',
        'radio', 'sports', 'animal', 'other'
      ]
      
      const status: Record<string, any> = {}
      
      for (const g of genres) {
        const key = `ranking-${g}`
        const data = await kv.get<any>(key)
        
        if (data) {
          status[g] = {
            exists: true,
            itemCount: data.items?.length || 0,
            popularTagsCount: data.popularTags?.length || 0,
            updatedAt: data.updatedAt,
            ttl: await kv.ttl(key)
          }
        } else {
          status[g] = { exists: false }
        }
      }
      
      return NextResponse.json({
        genres: status,
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}