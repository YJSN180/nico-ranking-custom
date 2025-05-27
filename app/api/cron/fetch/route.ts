import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { fetchNicoRanking } from '@/lib/fetch-rss'
import { mockRankingData } from '@/lib/mock-data'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let items
    
    // 実際のRSS取得を試みる（403エラーの可能性あり）
    try {
      items = await fetchNicoRanking()
    } catch (error) {
      // ジオブロックされた場合はモックデータを使用
      console.warn('Using mock data due to fetch error:', error)
      items = mockRankingData
    }
    
    await kv.set('nico:24h', JSON.stringify(items), {
      ex: 3900, // 65 minutes TTL
    })

    return NextResponse.json({
      success: true,
      itemsCount: items.length,
      timestamp: new Date().toISOString(),
      isMock: items === mockRankingData,
    })
  } catch (error) {
    console.error('Failed to fetch ranking:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ranking' },
      { status: 500 }
    )
  }
}