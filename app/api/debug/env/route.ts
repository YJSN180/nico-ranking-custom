import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  // 環境変数の確認（センシティブな情報は除外）
  const envInfo = {
    CLOUDFLARE_PROXY_URL: process.env.CLOUDFLARE_PROXY_URL || 'NOT_SET',
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    // KVの設定確認（値は隠す）
    KV_REST_API_URL_EXISTS: !!process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN_EXISTS: !!process.env.KV_REST_API_TOKEN,
  }

  return NextResponse.json(envInfo, {
    headers: {
      'Cache-Control': 'no-store'
    }
  })
}