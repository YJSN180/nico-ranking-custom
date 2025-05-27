import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { fetchNicoRanking } from '@/lib/fetch-rss'
import { mockRankingData } from '@/lib/mock-data'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let items
    
    // 実際のRSS取得を試みる（Googlebot User-Agentで地域制限を回避）
    try {
      items = await fetchNicoRanking()
    } catch (error) {
      // フォールバックとしてモックデータを使用
      items = mockRankingData
    }
    
    await kv.set('ranking-data', items, {
      ex: 86400, // 24 hours TTL
    })

    return NextResponse.json({
      success: true,
      itemsCount: items.length,
      timestamp: new Date().toISOString(),
      isMock: items === mockRankingData,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch ranking' },
      { status: 500 }
    )
  }
}