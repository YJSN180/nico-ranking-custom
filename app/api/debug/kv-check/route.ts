import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const results: any = {}
    
    // Check all genre caches
    const genres = ['all', 'entertainment', 'music_sound', 'game', 'anime', 'r18']
    
    for (const genre of genres) {
      const key = `ranking-${genre}`
      try {
        const data = await kv.get(key)
        
        if (data) {
          let items: any[] = []
          let popularTags: string[] = []
          
          // Handle different data formats
          if (typeof data === 'string') {
            try {
              const parsed = JSON.parse(data)
              if (Array.isArray(parsed)) {
                items = parsed
              } else if (parsed.items) {
                items = parsed.items
                popularTags = parsed.popularTags || []
              }
            } catch (e) {
              // Parse error
            }
          } else if (typeof data === 'object') {
            if (Array.isArray(data)) {
              items = data
            } else if ('items' in data) {
              items = (data as any).items || []
              popularTags = (data as any).popularTags || []
            }
          }
          
          // Check for sensitive videos
          const sensitiveVideos = items.filter((item: any) => 
            item.title?.includes('静電気') || item.title?.includes('Gundam')
          )
          
          results[genre] = {
            exists: true,
            dataType: typeof data,
            itemCount: items.length,
            popularTagCount: popularTags.length,
            sensitiveVideoCount: sensitiveVideos.length,
            sensitiveVideos: sensitiveVideos.map((v: any) => ({
              title: v.title,
              id: v.id,
              rank: v.rank
            })),
            sampleItems: items.slice(0, 3).map((item: any) => ({
              rank: item.rank,
              title: item.title,
              id: item.id
            }))
          }
        } else {
          results[genre] = { exists: false }
        }
      } catch (error: any) {
        results[genre] = { error: error.message }
      }
    }
    
    // Get TTL info
    const ttlResults: any = {}
    for (const genre of genres) {
      try {
        const ttl = await kv.ttl(`ranking-${genre}`)
        ttlResults[genre] = ttl > 0 ? `${Math.floor(ttl / 60)} minutes` : 'no expiry'
      } catch (e) {
        ttlResults[genre] = 'error'
      }
    }
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      kvStatus: 'connected',
      caches: results,
      ttl: ttlResults
    })
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      kvStatus: 'error'
    }, { status: 500 })
  }
}