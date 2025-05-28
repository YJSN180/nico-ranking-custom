import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { fetchEnhancedRanking } from '@/lib/fetch-enhanced-rss'
import { RANKING_TYPES } from '@/types/enhanced-ranking'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    // Simple admin key check
    const adminKey = request.headers.get('x-admin-key')
    if (adminKey !== process.env.ADMIN_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get ranking type from query params
    const typeId = request.nextUrl.searchParams.get('type') || 'daily-all'
    const rankingType = RANKING_TYPES.find(t => t.id === typeId)
    
    if (!rankingType) {
      return NextResponse.json({ 
        error: 'Invalid ranking type',
        validTypes: RANKING_TYPES.map(t => t.id)
      }, { status: 400 })
    }

    const items = await fetchEnhancedRanking(rankingType)
    
    if (!items || items.length === 0) {
      return NextResponse.json({ 
        error: 'No data fetched',
        message: 'Enhanced RSS fetch returned no items' 
      }, { status: 500 })
    }
    
    // Store in KV
    const kvKey = `enhanced-ranking-${rankingType.id}`
    await kv.set(kvKey, items, {
      ex: rankingType.term === 'hour' ? 3600 : 86400,
    })
    
    // Store update info
    await kv.set('enhanced-last-update-info', {
      timestamp: new Date().toISOString(),
      results: [{
        type: rankingType.id,
        success: true,
        itemCount: items.length
      }],
      source: 'manual-admin-trigger'
    })
    
    return NextResponse.json({ 
      success: true,
      type: rankingType.id,
      label: rankingType.label,
      itemCount: items.length,
      timestamp: new Date().toISOString(),
      message: 'Enhanced data updated successfully'
    })
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Update failed', 
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}