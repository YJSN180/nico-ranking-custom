import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { mockRankingData } from '@/lib/mock-data'

export async function GET() {
  try {
    // Populate KV with mock data
    await kv.set('ranking-data', mockRankingData, {
      ex: 86400, // 24 hours
    })
    
    return NextResponse.json({
      success: true,
      message: 'Mock data populated in KV store',
      count: mockRankingData.length,
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}