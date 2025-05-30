import { NextResponse } from 'next/server'
import { scrapeRankingPage } from '@/lib/scraper'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const result = await scrapeRankingPage('all', '24h')
    
    const staticElec = result.items.find(item => 
      item.title?.includes('静電気')
    )
    
    const gundam = result.items.find(item => 
      item.title?.includes('Gundam') || item.title?.includes('ジーク')
    )
    
    return NextResponse.json({
      totalItems: result.items.length,
      sensitiveVideos: {
        staticElec: {
          found: !!staticElec,
          title: staticElec?.title,
          id: staticElec?.id,
          rank: staticElec?.rank
        },
        gundam: {
          found: !!gundam,
          title: gundam?.title,
          id: gundam?.id,
          rank: gundam?.rank
        }
      },
      top5: result.items.slice(0, 5).map(item => ({
        rank: item.rank,
        title: item.title,
        id: item.id
      }))
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}