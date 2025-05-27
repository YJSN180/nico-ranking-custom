import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import type { RankingData } from '@/types/ranking'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const data = await kv.get<string>('nico:24h')
    
    if (!data) {
      return NextResponse.json(
        { error: 'No ranking data available' },
        { status: 502 }
      )
    }

    let rankingData: RankingData
    try {
      rankingData = JSON.parse(data)
    } catch {
      return NextResponse.json(
        { error: 'Invalid ranking data' },
        { status: 502 }
      )
    }

    return NextResponse.json(rankingData, {
      headers: {
        'Cache-Control': 's-maxage=30, stale-while-revalidate=30',
      },
    })
  } catch (error) {
    console.error('Failed to fetch ranking data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ranking data' },
      { status: 502 }
    )
  }
}