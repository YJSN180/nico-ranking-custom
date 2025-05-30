import { NextRequest, NextResponse } from 'next/server'
import type { RankingGenre } from '@/types/ranking-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Direct test of completeHybridScrapeV2 to see raw output
export async function GET(request: Request | NextRequest) {
  const { searchParams } = new URL(request.url)
  const genre = (searchParams.get('genre') || 'all') as RankingGenre
  
  try {
    // Import and call the v2 implementation directly
    const { completeHybridScrapeV2 } = await import('@/lib/complete-hybrid-scraper-v2')
    const result = await completeHybridScrapeV2(genre, '24h')
    
    // Analyze the result
    const analysis = {
      totalItems: result.items.length,
      hasPopularTags: !!result.popularTags && result.popularTags.length > 0,
      popularTagCount: result.popularTags?.length || 0,
      itemFields: result.items.length > 0 ? Object.keys(result.items[0]!) : [],
      sensitiveItems: result.items.filter(item => item.requireSensitiveMasking === true).length,
      sampleItems: result.items.slice(0, 5).map(item => ({
        id: item.id,
        title: item.title?.substring(0, 50) + '...',
        requireSensitiveMasking: item.requireSensitiveMasking,
        hasAuthorInfo: !!item.authorName,
        hasTags: !!item.tags && item.tags.length > 0
      })),
      sensitiveVideos: result.items
        .filter(item => item.requireSensitiveMasking === true)
        .slice(0, 5)
        .map(item => ({
          id: item.id,
          title: item.title,
          requireSensitiveMasking: item.requireSensitiveMasking,
          rank: item.rank
        }))
    }
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      genre,
      result: {
        items: result.items.slice(0, 10), // First 10 items for inspection
        popularTags: result.popularTags
      },
      analysis
    }, {
      headers: {
        'Cache-Control': 'no-store',
      }
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      genre,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-store',
      }
    })
  }
}