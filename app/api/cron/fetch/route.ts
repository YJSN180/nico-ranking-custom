import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { fetchNicoRanking } from '@/lib/fetch-rss'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const items = await fetchNicoRanking()
    
    await kv.set('nico:24h', JSON.stringify(items), {
      ex: 3900, // 65 minutes TTL
    })

    return NextResponse.json({
      success: true,
      itemsCount: items.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Failed to fetch ranking:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ranking' },
      { status: 500 }
    )
  }
}