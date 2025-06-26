import { NextRequest, NextResponse } from 'next/server'
import { getVideoStats } from '@/lib/video-stats-cache'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params
    
    if (!videoId || typeof videoId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid video ID' },
        { status: 400 }
      )
    }
    
    // キャッシュ優先で動画統計を取得
    const stats = await getVideoStats(videoId)
    
    if (!stats) {
      return NextResponse.json(
        { error: 'Stats not found' },
        { 
          status: 404,
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
            'CDN-Cache-Control': 'max-age=60'
          }
        }
      )
    }
    
    // 成功レスポンス（5分間キャッシュ）
    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'CDN-Cache-Control': 'max-age=300',
        'Vary': 'Accept-Encoding'
      }
    })
    
  } catch (error) {
    console.error('[VideoStats API] Error:', error)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    )
  }
}

// バッチ取得用のPOSTエンドポイント
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { videoIds } = body
    
    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid video IDs array' },
        { status: 400 }
      )
    }
    
    // 最大100件まで
    if (videoIds.length > 100) {
      return NextResponse.json(
        { error: 'Too many video IDs (max 100)' },
        { status: 400 }
      )
    }
    
    // 並列で統計を取得
    const promises = videoIds.map(async (videoId: string) => {
      const stats = await getVideoStats(videoId)
      return { videoId, stats }
    })
    
    const results = await Promise.all(promises)
    const statsMap = results.reduce((acc, { videoId, stats }) => {
      acc[videoId] = stats
      return acc
    }, {} as Record<string, any>)
    
    return NextResponse.json(statsMap, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'CDN-Cache-Control': 'max-age=300',
        'Vary': 'Accept-Encoding'
      }
    })
    
  } catch (error) {
    console.error('[VideoStats Batch API] Error:', error)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    )
  }
}