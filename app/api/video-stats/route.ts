import { NextRequest, NextResponse } from 'next/server'
import { fetchVideoStats } from '@/lib/snapshot-api'

export const runtime = 'nodejs'

// 動画の最新統計情報を取得するAPI
export async function GET(request: Request | NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const videoIds = searchParams.get('ids')?.split(',').filter(Boolean) || []
    
    if (videoIds.length === 0) {
      return NextResponse.json({ error: 'No video IDs provided' }, { status: 400 })
    }
    
    // 最大500件まで許可（ジャンル別ランキングの最大表示数）
    if (videoIds.length > 500) {
      return NextResponse.json({ error: 'Too many video IDs (max 500)' }, { status: 400 })
    }
    
    // Snapshot APIから統計情報を取得
    const stats = await fetchVideoStats(videoIds)
    
    // レスポンスにタイムスタンプを追加
    const response = {
      stats,
      timestamp: new Date().toISOString(),
      count: Object.keys(stats).length
    }
    
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    // Failed to fetch video stats - returning error response
    return NextResponse.json(
      { error: 'Failed to fetch video stats' },
      { status: 500 }
    )
  }
}