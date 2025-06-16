import { NextResponse } from 'next/server'

export async function GET() {
  // 環境変数の状態を確認（値は隠す）
  const envStatus = {
    CLOUDFLARE_ACCOUNT_ID: !!process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_KV_NAMESPACE_ID: !!process.env.CLOUDFLARE_KV_NAMESPACE_ID,
    CLOUDFLARE_KV_API_TOKEN: !!process.env.CLOUDFLARE_KV_API_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  }

  // KVからデータを取得できるか試す
  let kvData = null
  let kvError = null
  let genreTest = null
  
  if (envStatus.CLOUDFLARE_ACCOUNT_ID && envStatus.CLOUDFLARE_KV_NAMESPACE_ID && envStatus.CLOUDFLARE_KV_API_TOKEN) {
    try {
      const { getRankingFromKV, getGenreRanking } = await import('@/lib/cloudflare-kv')
      
      // 1. 全体データの取得を試みる
      // console.log('[KV Debug] Attempting to fetch full ranking data...')
      const data = await getRankingFromKV()
      
      if (data) {
        kvData = {
          hasData: true,
          genreCount: Object.keys(data.genres).length,
          metadata: data.metadata,
          timestamp: data.timestamp,
        }
      } else {
        kvData = { hasData: false, message: 'getRankingFromKV returned null' }
      }
      
      // 2. 個別ジャンルの取得を試みる（データサイズ問題の確認）
      // console.log('[KV Debug] Attempting to fetch single genre data...')
      const genreData = await getGenreRanking('all', '24h')
      if (genreData) {
        genreTest = {
          success: true,
          itemCount: genreData.items.length,
          popularTagsCount: genreData.popularTags?.length || 0,
          firstItem: genreData.items[0] ? {
            id: genreData.items[0].id,
            title: genreData.items[0].title,
            views: genreData.items[0].views,
          } : null
        }
      } else {
        genreTest = { success: false, message: 'getGenreRanking returned null' }
      }
      
    } catch (error) {
      kvError = error instanceof Error ? error.message : 'Unknown error'
      // console.error('[KV Debug] Error:', error)
    }
  } else {
    kvError = 'Missing required environment variables'
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: envStatus,
    kvStatus: kvData,
    kvError,
    genreTest,
    vercelLimits: {
      maxResponseSize: '4.5MB',
      note: 'KV data is 8.4MB compressed, which exceeds Vercel limits'
    }
  }, {
    headers: {
      'Cache-Control': 'no-store',
    }
  })
}