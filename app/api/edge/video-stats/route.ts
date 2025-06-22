import { NextRequest, NextResponse } from 'next/server'

// This API fetches video stats from Cloudflare KV
// Uses Node.js runtime for KV access compatibility
export const runtime = 'nodejs'

// Cache configuration
// revalidateを削除してCache-Controlヘッダーで制御
// export const revalidate = 300 // 5 minutes

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const ids = searchParams.get('ids')
    
    if (!ids) {
      return NextResponse.json(
        { error: 'Missing ids parameter' },
        { status: 400 }
      )
    }
    
    const videoIds = ids.split(',').filter(Boolean).slice(0, 50) // Max 50 IDs
    
    if (videoIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid video IDs provided' },
        { status: 400 }
      )
    }
    
    // Fetch from Cloudflare KV
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
    
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      return NextResponse.json(
        { 
          error: 'KV configuration missing',
          debug: {
            hasAccountId: !!CF_ACCOUNT_ID,
            hasNamespaceId: !!CF_NAMESPACE_ID,
            hasApiToken: !!CF_API_TOKEN
          }
        },
        { status: 500 }
      )
    }
    
    const kvUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/VIDEO_STATS_LATEST`
    
    const kvResponse = await fetch(kvUrl, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
      next: { revalidate: 300 } // Cache for 5 minutes
    })
    
    if (!kvResponse.ok) {
      // Log and return error details for debugging
      const errorText = await kvResponse.text()
      console.error('[Video Stats API] KV fetch failed:', {
        status: kvResponse.status,
        statusText: kvResponse.statusText,
        error: errorText.substring(0, 500)
      })
      
      // Return empty stats with debug info
      return NextResponse.json({
        stats: {},
        timestamp: new Date().toISOString(),
        count: 0,
        debug: {
          kvStatus: kvResponse.status,
          kvStatusText: kvResponse.statusText,
          namespaceIdPreview: CF_NAMESPACE_ID ? 
            `${CF_NAMESPACE_ID.substring(0, 4)}...${CF_NAMESPACE_ID.substring(CF_NAMESPACE_ID.length - 4)}` : 
            'undefined'
        }
      })
    }
    
    const statsData = await kvResponse.json()
    
    // Filter to only requested video IDs and convert to expected format
    const filteredStats: Record<string, any> = {}
    for (const id of videoIds) {
      if (statsData.stats?.[id]) {
        const stat = statsData.stats[id]
        filteredStats[id] = {
          viewCounter: stat.viewCounter,
          commentCounter: stat.commentCounter,
          mylistCounter: stat.mylistCounter,
          likeCounter: stat.likeCounter
        }
      }
    }
    
    const response = NextResponse.json({
      stats: filteredStats,
      timestamp: statsData.metadata?.updatedAt || new Date().toISOString(),
      count: Object.keys(filteredStats).length
    })
    
    // エッジキャッシュを活用して読み取り回数を削減
    // WorkerのCron間隔（2分）に合わせて120秒のキャッシュを設定
    response.headers.set('Cache-Control', 'public, max-age=120, s-maxage=120, stale-while-revalidate=60')
    
    return response
    
  } catch (error) {
    console.error('[Video Stats API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch video stats' },
      { status: 500 }
    )
  }
}