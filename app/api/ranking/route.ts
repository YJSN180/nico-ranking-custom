import { NextRequest, NextResponse } from 'next/server'

// Edge Runtimeで実行（より高速）
export const runtime = 'edge'

// キャッシュの設定
export const revalidate = 1800 // 30分

// プレビュー環境ではプロキシとして動作し、本番環境ではCloudflare Workerにリダイレクトします。
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  // プレビュー環境かどうかを判定
  const host = request.headers.get('host') || ''
  const isVercelApp = host.includes('.vercel.app')
  const isGitPreviewDomain = /nico-ranking-custom-(?:git-[a-z0-9-]+|[a-z0-9]+)-yjsns-projects/.test(host)
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1') || host.includes('0.0.0.0')
  const isPreviewEnv = process.env.VERCEL_ENV === 'preview'
  const isPreview = isLocalhost || isPreviewEnv || (isVercelApp && isGitPreviewDomain)
  
  if (isPreview) {
    // プレビュー環境ではプロキシとして動作
    try {
      const apiGatewayUrl = 'https://nico-rank.com/api/ranking'
      const url = new URL(apiGatewayUrl)
      
      // クエリパラメータを転送
      searchParams.forEach((value, key) => {
        url.searchParams.set(key, value)
      })
      
      // ETagヘッダーを転送（条件付きリクエスト）
      const ifNoneMatch = request.headers.get('if-none-match')
      const headers: HeadersInit = {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'nico-ranking-preview/1.0',
        'X-Forwarded-Host': host,
        'X-Forwarded-Proto': 'https'
      }
      
      if (ifNoneMatch) {
        headers['If-None-Match'] = ifNoneMatch
      }
      
      // Cloudflare Workerにリクエストを転送（タイムアウト付き）
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒タイムアウト
      
      const response = await fetch(url.toString(), {
        headers,
        signal: controller.signal,
        // キャッシュ制御
        next: { revalidate: 1800 }
      }).finally(() => {
        clearTimeout(timeoutId)
      })
      
      // 304 Not Modifiedの場合はそのまま返す（ただしキャッシュ禁止）
      if (response.status === 304) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            'cache-control': 'no-store',
            'cdn-cache-control': 'no-store',
            'etag': response.headers.get('etag') || ''
          }
        })
      }
      
      // レスポンスボディを取得（自動的に解凍される）
      const data = await response.text()
      
      // レスポンスヘッダーをコピー（最小限に）
      const responseHeaders = new Headers()
      
      // 必要なヘッダーのみコピー
      const etag = response.headers.get('etag')
      const lastModified = response.headers.get('last-modified')
      
      if (etag) responseHeaders.set('etag', etag)
      if (lastModified) responseHeaders.set('last-modified', lastModified)
      
      // Content-Type
      responseHeaders.set('content-type', 'application/json')
      
      // キャッシュ禁止（ブラウザ・CDN・Vercel Edge）
      // 短期エッジキャッシュ + SWR で鮮度と性能を両立（10分）
      const sMaxage = 600
      const swr = 540
      responseHeaders.set('cache-control', `public, max-age=0, s-maxage=${sMaxage}, stale-while-revalidate=${swr}`)
      responseHeaders.set('cdn-cache-control', `public, s-maxage=${sMaxage}`)
      responseHeaders.set('vercel-cdn-cache-control', `public, s-maxage=${sMaxage}`)
      
      return new NextResponse(data, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      })
    } catch (error) {
      console.error('[API/ranking] Proxy error:', error)
      console.error('[API/ranking] Target URL:', 'https://nico-rank.com/api/ranking')
      console.error('[API/ranking] Preview host:', host)
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const isTimeout = errorMessage.includes('abort') || errorMessage.includes('timeout')
      
      return NextResponse.json(
        { 
          error: 'Failed to fetch ranking data',
          details: isTimeout ? 'Request timeout (30s)' : errorMessage,
          type: 'proxy_error'
        },
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
