import { NextRequest, NextResponse } from 'next/server'

// このエンドポイントは非推奨です。
// Cloudflare Workerに直接リダイレクトして、Vercel Function使用量を削減します。
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  // Cloudflare Workerへ永続的にリダイレクト
  const apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'https://nico-rank.com'
  const redirectUrl = new URL('/api/ranking', apiGatewayUrl)
  
  // クエリパラメータをそのまま転送
  searchParams.forEach((value, key) => {
    redirectUrl.searchParams.set(key, value)
  })
  
  return NextResponse.redirect(redirectUrl.toString(), 301)
}