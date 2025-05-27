import { NextRequest, NextResponse } from 'next/server'
import { fetchNicoRanking } from '@/lib/fetch-rss'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // Simple auth check
  const debugKey = request.nextUrl.searchParams.get('key')
  if (debugKey !== 'debug-123') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const items = await fetchNicoRanking()
    
    return NextResponse.json({
      success: true,
      itemsCount: items.length,
      sampleItems: items.slice(0, 3),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to fetch', 
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}