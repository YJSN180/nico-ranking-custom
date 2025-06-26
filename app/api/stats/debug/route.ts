import { NextRequest, NextResponse } from 'next/server'
import { getCacheStats } from '@/lib/video-stats-cache'

export async function GET(request: NextRequest) {
  try {
    const cacheStats = getCacheStats()
    
    return NextResponse.json({
      cache: cacheStats,
      environment: {
        hasKvToken: !!process.env.KV_REST_API_TOKEN,
        hasKvUrl: !!process.env.KV_REST_API_URL,
        hasWorkerAuth: !!process.env.WORKER_AUTH_KEY,
        timestamp: new Date().toISOString()
      }
    }, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json'
      }
    })
    
  } catch (error) {
    console.error('[VideoStats Debug] Error:', error)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}