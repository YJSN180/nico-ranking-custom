import { NextRequest, NextResponse } from 'next/server'

// プレビュー環境ではプロキシとして動作し、本番環境ではCloudflare Workerにリダイレクトします。
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  // プレビュー環境かどうかを判定
  const host = request.headers.get('host') || ''
  // プレビュー環境: nico-ranking-custom-[ランダム文字列]-yjsns-projects.vercel.app
  // 本番環境: nico-ranking-custom-yjsns-projects.vercel.app
  const isVercelApp = host.includes('.vercel.app')
  const hasRandomString = /nico-ranking-custom-[a-z0-9]+-yjsns-projects/.test(host)
  const isPreview = isVercelApp && hasRandomString
  
  console.log('[API Route] Environment check:', { host, isPreview, isVercelApp, hasRandomString })
  
  if (isPreview) {
    // プレビュー環境ではプロキシとして動作
    try {
      const apiGatewayUrl = 'https://nico-rank.com/api/ranking'
      const url = new URL(apiGatewayUrl)
      
      // クエリパラメータを転送
      searchParams.forEach((value, key) => {
        url.searchParams.set(key, value)
      })
      
      // Cloudflare Workerにリクエストを転送
      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate, br',
          'User-Agent': 'nico-ranking-preview/1.0',
          // オリジナルのホストを転送（CORS対応のため）
          'X-Forwarded-Host': host,
          'X-Forwarded-Proto': 'https'
        }
      })
      
      // レスポンスボディを取得（自動的に解凍される）
      const data = await response.text()
      
      // レスポンスヘッダーをコピー（一部調整）
      const headers = new Headers()
      response.headers.forEach((value, key) => {
        const lowerKey = key.toLowerCase()
        // CORSとセキュリティヘッダー、Content-Encodingは除外
        // （解凍済みのデータを返すため）
        if (!lowerKey.startsWith('access-control-') &&
            !lowerKey.includes('x-frame-options') &&
            !lowerKey.includes('x-content-type-options') &&
            lowerKey !== 'content-encoding' &&
            lowerKey !== 'content-length') {
          headers.set(key, value)
        }
      })
      
      // Content-Typeが設定されていない場合は追加
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json')
      }
      
      // キャッシュヘッダーを追加（Cloudflare Workersと同様）
      if (!headers.has('cache-control')) {
        headers.set('cache-control', 'public, max-age=1800, s-maxage=3600')
      }
      
      return new NextResponse(data, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    } catch (error) {
      console.error('[Preview Proxy] Error fetching from Cloudflare Worker:', error)
      return NextResponse.json(
        { error: 'Failed to fetch ranking data' },
        { status: 500 }
      )
    }
  } else {
    // 本番環境では301リダイレクト（既存の動作）
    const apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'https://nico-rank.com'
    const redirectUrl = new URL('/api/ranking', apiGatewayUrl)
    
    // クエリパラメータをそのまま転送
    searchParams.forEach((value, key) => {
      redirectUrl.searchParams.set(key, value)
    })
    
    return NextResponse.redirect(redirectUrl.toString(), 301)
  }
}