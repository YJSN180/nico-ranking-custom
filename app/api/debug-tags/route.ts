import { NextResponse } from 'next/server'
import { getRankingFromKV } from '@/lib/cloudflare-kv'

export async function GET() {
  try {
    const allData = await getRankingFromKV()
    if (!allData || !allData.genres) {
      return NextResponse.json({ error: 'No data in KV' }, { status: 404 })
    }

    const result: Record<string, Record<string, string[]>> = {}
    
    for (const [genre, genreData] of Object.entries(allData.genres)) {
      result[genre] = {}
      
      if (genreData['24h']?.tags) {
        result[genre]['24h'] = Object.keys(genreData['24h'].tags)
      }
      
      if (genreData['hour']?.tags) {
        result[genre]['hour'] = Object.keys(genreData['hour'].tags)
      }
    }
    
    return NextResponse.json({
      tags: result,
      metadata: allData.metadata
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 })
  }
}