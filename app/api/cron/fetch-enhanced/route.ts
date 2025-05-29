import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { fetchEnhancedRanking } from '@/lib/fetch-enhanced-rss'
import { RANKING_TYPES } from '@/types/enhanced-ranking'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = []
    
    // Fetch multiple ranking types
    const typesToFetch = [
      RANKING_TYPES[0], // hourly-all
      RANKING_TYPES[1], // daily-all
      RANKING_TYPES[4], // daily-entertainment
      RANKING_TYPES[5], // daily-game
    ]
    
    for (const rankingType of typesToFetch) {
      try {
        const items = await fetchEnhancedRanking(rankingType)
        
        // Store in KV with type-specific key
        const kvKey = `enhanced-ranking-${rankingType!.id}`
        await kv.set(kvKey, items, {
          ex: rankingType!.term === 'hour' ? 3600 : 86400, // 1 hour for hourly, 24 hours for others
        })
        
        results.push({
          type: rankingType!.id,
          success: true,
          itemCount: items.length
        })
      } catch (error) {
        results.push({
          type: rankingType!.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    // Store update info
    await kv.set('enhanced-last-update-info', {
      timestamp: new Date().toISOString(),
      results,
      source: 'scheduled-cron-enhanced'
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch enhanced rankings' },
      { status: 500 }
    )
  }
}