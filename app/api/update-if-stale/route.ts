import { NextResponse } from 'next/server'
import { kv } from '@/lib/simple-kv'
import { fetchNicoRanking } from '@/lib/fetch-rss'
// import { mockRankingData } from '@/lib/mock-data' // モックデータは使用しない

export const runtime = 'nodejs'

export async function GET() {
  try {
    // Check current data and its age
    const currentData = await kv.get('ranking-data')
    const lastUpdateInfo = await kv.get('last-update-info') as {
      timestamp: string
      itemCount: number
      source: string
    } | null
    
    // If no data exists, update immediately
    if (!currentData || !lastUpdateInfo) {
      return await updateData()
    }
    
    // Check if data is older than 30 minutes
    const lastUpdate = new Date(lastUpdateInfo.timestamp)
    const now = new Date()
    const ageInMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60)
    
    if (ageInMinutes >= 30) {
      // Data is stale, update it
      return await updateData()
    }
    
    // Data is fresh
    return NextResponse.json({
      updated: false,
      lastUpdate: lastUpdateInfo.timestamp,
      ageInMinutes: Math.round(ageInMinutes),
      nextUpdateIn: Math.round(30 - ageInMinutes) + ' minutes'
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to check update status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

async function updateData() {
  try {
    let items: any[] = []
    let isRealData = true
    
    try {
      // Try to fetch real data
      items = await fetchNicoRanking()
    } catch (error) {
      // エラー時は空のデータを設定（モックデータは使用しない）
      items = []
      isRealData = false
    }
    
    if (!items || items.length === 0) {
      return NextResponse.json({ 
        error: 'No data fetched',
        updated: false 
      }, { status: 500 })
    }
    
    // Store in KV with 1 hour TTL
    await kv.set('ranking-data', items, {
      ex: 3600, // 1 hour TTL
    })
    
    // Store update info
    const updateInfo = {
      timestamp: new Date().toISOString(),
      itemCount: items.length,
      source: 'on-demand-update',
      isRealData
    }
    await kv.set('last-update-info', updateInfo)
    
    return NextResponse.json({ 
      updated: true,
      itemCount: items.length,
      timestamp: updateInfo.timestamp,
      message: 'Data updated successfully',
      isRealData
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Update failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}