import { NextRequest, NextResponse } from 'next/server'
import { captureWebException } from '@/lib/sentry/capture'

// Edge Runtimeで実行（より高速）
export const runtime = 'edge'

// キャッシュを無効化（古いデータ問題を防ぐため）
// Cloudflare Worker側でキャッシュを管理するため、Vercel側はキャッシュしない
export const revalidate = 0
export const dynamic = 'force-dynamic'

// プレビュー用プロキシの期限（上流の応答と本文の読み取りを含む）。Edge Function は最初の応答を
// 25 秒以内に返す必要があるため、それより前に打ち切って自前のエラー応答を返す
const PREVIEW_PROXY_TIMEOUT_MS = 20_000

/** ログ用の失敗の要約。URL（クエリの値を含む）は伏せる。詳細は Sentry へ送る */
function describeProxyError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error'
  return `${error.name}: ${error.message.replace(/https?:\/\/\S+/gi, '<url>')}`
}

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
      // 期限は本文の読み取りまで掛ける（ヘッダー受信で外すと、本文が止まったときに Edge の上限まで待つ）
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), PREVIEW_PROXY_TIMEOUT_MS)
      
      let response: Response
      let data: string | null
      try {
        response = await fetch(url.toString(), {
          headers,
          signal: controller.signal,
          // キャッシュ無効化: ISRキャッシュによる古いデータ問題を防ぐ
          cache: 'no-store'
        })
        // レスポンスボディを取得（自動的に解凍される）。304 には本文が無い
        data = response.status === 304 ? null : await response.text()
      } finally {
        clearTimeout(timeoutId)
      }
      
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
      
      // レスポンスヘッダーをコピー（最小限に）
      const responseHeaders = new Headers()
      
      // 必要なヘッダーのみコピー
      const etag = response.headers.get('etag')
      const lastModified = response.headers.get('last-modified')
      
      if (etag) responseHeaders.set('etag', etag)
      if (lastModified) responseHeaders.set('last-modified', lastModified)
      
      // Content-Type
      responseHeaders.set('content-type', 'application/json')
      
      // キャッシュを短縮（5分）して、より頻繁に新しいデータを取得
      // ただし、完全に無効にするとパフォーマンスに影響するため、SWRで対応
      const sMaxage = 300 // 5分
      const swr = 60 // 1分のSWR
      responseHeaders.set('cache-control', `public, max-age=0, s-maxage=${sMaxage}, stale-while-revalidate=${swr}`)
      responseHeaders.set('cdn-cache-control', `public, s-maxage=${sMaxage}`)
      responseHeaders.set('vercel-cdn-cache-control', `public, s-maxage=${sMaxage}`)
      
      return new NextResponse(data, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      })
    } catch (error) {
      // ログには失敗の種類だけを残す（URL・クエリの値・ホストは出さない）
      console.error('[API/ranking] Proxy error:', describeProxyError(error))

      captureWebException(error, {
        tags: {
          runtime: 'next-edge',
          surface: 'preview-ranking-proxy',
          endpoint_family: '/api/ranking',
          has_tag: searchParams.has('tag'),
          is_preview: isPreview,
          upstream_kind: 'cloudflare-worker',
        },
        contexts: {
          proxy_request: {
            host,
            hasTag: searchParams.has('tag'),
            genre: searchParams.get('genre') || 'all',
            period: searchParams.get('period') || '24h',
          },
        },
      })
      
      // 本文にはエラーの詳細を入れない
      return NextResponse.json(
        { 
          error: 'Failed to fetch ranking data',
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
