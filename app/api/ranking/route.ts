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
  
  // 本番・プレビューともにプロキシで処理（自己リダイレクトを防止）
  try {
    const apiGatewayUrl = 'https://nico-rank.com/api/ranking'
    const url = new URL(apiGatewayUrl)
    searchParams.forEach((value, key) => {
      url.searchParams.set(key, value)
    })

    const ifNoneMatch = request.headers.get('if-none-match')
    const headers: HeadersInit = {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate, br',
      'User-Agent': isPreview ? 'nico-ranking-preview/1.0' : 'nico-ranking-prod/1.0',
      'X-Forwarded-Host': host,
      'X-Forwarded-Proto': 'https'
    }
    if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    const response = await fetch(url.toString(), {
      headers,
      signal: controller.signal,
      next: { revalidate: 1800 }
    }).finally(() => clearTimeout(timeoutId))

    if (response.status === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'cache-control': 'public, max-age=1800, s-maxage=3600',
          'etag': response.headers.get('etag') || ''
        }
      })
    }

    const data = await response.text()
    const responseHeaders = new Headers()
    const etag = response.headers.get('etag')
    const lastModified = response.headers.get('last-modified')
    const cacheControl = response.headers.get('cache-control')
    if (etag) responseHeaders.set('etag', etag)
    if (lastModified) responseHeaders.set('last-modified', lastModified)
    responseHeaders.set('content-type', 'application/json')
    responseHeaders.set('cache-control', cacheControl || 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400')
    responseHeaders.set('cdn-cache-control', 'max-age=3600, stale-while-revalidate=86400')

    return new NextResponse(data, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    })
  } catch (error) {
    console.error('[API/ranking] Proxy error:', error)
    console.error('[API/ranking] Preview flag:', isPreview, 'host:', host)
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
}
