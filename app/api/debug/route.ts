import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { fetchNicoRanking } from '@/lib/fetch-rss'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // Simple auth check
  const debugKey = request.nextUrl.searchParams.get('key')
  if (debugKey !== 'debug-123') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // KVから直接データを取得
    const kvData = await kv.get<string>('nico:24h')
    
    let parsedData = null
    let parseError = null
    
    if (kvData) {
      try {
        parsedData = JSON.parse(kvData)
      } catch (e) {
        parseError = e instanceof Error ? e.message : 'Unknown parse error'
      }
    }
    
    // fetchRankingDataを実行してみる
    let fetchError = null
    let fetchedData = null
    try {
      const { fetchRankingData } = await import('@/lib/data-fetcher')
      fetchedData = await fetchRankingData()
    } catch (e) {
      fetchError = e instanceof Error ? e.message : 'Unknown fetch error'
    }
    
    return NextResponse.json({
      kvData: {
        exists: !!kvData,
        type: typeof kvData,
        length: kvData ? kvData.length : 0,
        firstChars: kvData ? kvData.substring(0, 100) : null,
        parseError,
        parsedDataLength: parsedData ? parsedData.length : 0,
        sampleParsedData: parsedData ? parsedData.slice(0, 2) : null,
      },
      fetchTest: {
        error: fetchError,
        dataLength: fetchedData ? fetchedData.length : 0,
        sampleData: fetchedData ? fetchedData.slice(0, 2) : null,
      },
      env: {
        baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'not set',
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to debug', 
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}