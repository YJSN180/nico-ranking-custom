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
  const hasRandomString = /nico-ranking-custom-[a-z0-9]+-yjsns-projects/.test(host)
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1') || host.includes('0.0.0.0')
  const isPreview = (isVercelApp && hasRandomString) || isLocalhost

  if (isPreview) {
    // プレビュー環境ではプロキシとして動作
    try {
      const apiGatewayUrl = 'https://nico-rank.com/api/popular-tags'
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

      // 304 Not Modifiedの場合はそのまま返す
      if (response.status === 304) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            'cache-control': 'public, max-age=1800, s-maxage=3600',
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
      const cacheControl = response.headers.get('cache-control')
      const dataSource = response.headers.get('x-data-source')

      if (etag) responseHeaders.set('etag', etag)
      if (lastModified) responseHeaders.set('last-modified', lastModified)
      if (dataSource) responseHeaders.set('x-data-source', dataSource)

      // Content-Type
      responseHeaders.set('content-type', 'application/json')

      // キャッシュヘッダー（Vercel Edge Cacheも活用）
      responseHeaders.set('cache-control', cacheControl || 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400')

      // CDN-Cache-Control（Vercel専用）
      responseHeaders.set('cdn-cache-control', 'max-age=3600, stale-while-revalidate=86400')

      return new NextResponse(data, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      })
    } catch (error) {
      console.error('[API/popular-tags] Proxy error:', error)
      console.error('[API/popular-tags] Target URL:', 'https://nico-rank.com/api/popular-tags')
      console.error('[API/popular-tags] Preview host:', host)

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const isTimeout = errorMessage.includes('abort') || errorMessage.includes('timeout')

      return NextResponse.json(
        {
          tags: [],
          total: 0,
          page: 1,
          limit: 50,
          error: 'Failed to fetch popular tags',
          details: isTimeout ? 'Request timeout (30s)' : errorMessage,
          type: 'proxy_error'
        },
        { status: 500 }
      )
    }
  } else {
    // 本番環境では301リダイレクト（既存の動作）
    const apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'https://nico-rank.com'
    const redirectUrl = new URL('/api/popular-tags', apiGatewayUrl)

    // クエリパラメータをそのまま転送
    searchParams.forEach((value, key) => {
      redirectUrl.searchParams.set(key, value)
    })

    return NextResponse.redirect(redirectUrl.toString(), 301)
  }
}