import { NextRequest, NextResponse } from 'next/server'
import { getVideoStatsFromKV } from '@/lib/video-stats-kv'
import { fetchVideoStats } from '@/lib/snapshot-api'

// Edge Runtime指定
export const runtime = 'edge'

// 動画の最新統計情報を取得するAPI (Edge Function版)
export async function GET(request: NextRequest) {
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
    
    // 1. First try to get stats from KV
    const kvStats = await getVideoStatsFromKV(videoIds)
    const kvHitIds = Object.keys(kvStats)
    
    // 2. Identify missing video IDs
    const missingIds = videoIds.filter(id => !kvHitIds.includes(id))
    
    // 3. Fetch only missing stats from Snapshot API
    const freshStats = missingIds.length > 0 
      ? await fetchVideoStats(missingIds)
      : {}
    
    // 4. Merge results
    const allStats = { ...kvStats, ...freshStats }
    
    // 5. Calculate KV hit rate for monitoring
    const kvHitRate = videoIds.length > 0 ? kvHitIds.length / videoIds.length : 0
    
    // レスポンスにタイムスタンプを追加
    const response = {
      stats: allStats,
      timestamp: new Date().toISOString(),
      count: Object.keys(allStats).length,
      kvHitRate // For debugging/monitoring
    }
    
    return NextResponse.json(response, {
      headers: {
        // Use longer cache when most data is from KV (5 minutes)
        // This matches the KV update interval
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
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