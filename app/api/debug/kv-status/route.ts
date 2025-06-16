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
  
  if (envStatus.CLOUDFLARE_ACCOUNT_ID && envStatus.CLOUDFLARE_KV_NAMESPACE_ID && envStatus.CLOUDFLARE_KV_API_TOKEN) {
    try {
      const { getRankingFromKV } = await import('@/lib/cloudflare-kv')
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
    } catch (error) {
      kvError = error instanceof Error ? error.message : 'Unknown error'
    }
  } else {
    kvError = 'Missing required environment variables'
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: envStatus,
    kvStatus: kvData,
    kvError,
  }, {
    headers: {
      'Cache-Control': 'no-store',
    }
  })
}