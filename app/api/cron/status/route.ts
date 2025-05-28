import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const runtime = 'edge'

export async function GET() {
  try {
    // Get the current data from KV
    const data = await kv.get('ranking-data')
    
    // Get update history if stored
    const lastUpdate = await kv.get('last-update-info')
    
    const hasData = !!data
    const dataCount = Array.isArray(data) ? data.length : 0
    
    return NextResponse.json({
      hasData,
      dataCount,
      lastUpdate,
      currentTime: new Date().toISOString(),
      currentTimeJST: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
      nextScheduledUpdate: '12:00 JST daily',
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to fetch status',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}