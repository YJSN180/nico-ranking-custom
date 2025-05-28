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
    
    // Calculate data age and freshness
    let dataAge = null
    let isFresh = false
    let nextUpdateIn = null
    
    if (lastUpdate && typeof lastUpdate === 'object' && 'timestamp' in lastUpdate) {
      const updateInfo = lastUpdate as { timestamp: string; itemCount: number; source: string }
      const updateTime = new Date(updateInfo.timestamp)
      const ageInMinutes = (Date.now() - updateTime.getTime()) / (1000 * 60)
      dataAge = Math.round(ageInMinutes) + ' minutes'
      isFresh = ageInMinutes < 60
      nextUpdateIn = isFresh ? Math.round(60 - ageInMinutes) + ' minutes' : 'needed now'
    }
    
    return NextResponse.json({
      hasData,
      dataCount,
      lastUpdate,
      dataAge,
      isFresh,
      nextUpdateIn,
      currentTime: new Date().toISOString(),
      currentTimeJST: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
      nextScheduledCron: '12:00 JST daily',
      updateStrategy: 'Hourly auto-update on page visit if data is stale',
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to fetch status',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}