import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { fetchNicoRanking } from '@/lib/fetch-rss'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    // Simple admin key check
    const adminKey = request.headers.get('x-admin-key')
    if (adminKey !== process.env.ADMIN_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const items = await fetchNicoRanking()
    
    if (!items || items.length === 0) {
      return NextResponse.json({ 
        error: 'No data fetched',
        message: 'RSS fetch returned no items' 
      }, { status: 500 })
    }
    
    // Store in KV with 1 hour TTL
    await kv.set('ranking-data', items, {
      ex: 3600, // 1 hour TTL
    })
    
    // Store update info
    await kv.set('last-update-info', {
      timestamp: new Date().toISOString(),
      itemCount: items.length,
      source: 'manual-admin-trigger'
    })
    
    return NextResponse.json({ 
      success: true,
      itemCount: items.length,
      timestamp: new Date().toISOString(),
      message: 'Data updated successfully'
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