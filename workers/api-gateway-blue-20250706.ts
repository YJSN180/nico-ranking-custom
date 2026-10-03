import { fetchUpstream, isAdminPath, noStore } from './utils/upstream-proxy'
/**
 * Blue Worker - 待機系 API Gateway (Blue/Green用)
 * Green と同じ R2 のランキング世代を読み、同じ本文を返す
 *
 * 🔵 バックアップWorker (待機中)
 * ルーター（smart-router-20250706.ts）は次のときに /api/*（管理パスを除く）をこの Worker へ送る:
 * - KV の active_worker が 'green' 以外のとき（未設定・空・'blue' を含む）
 * - KV の読み取りや Green の呼び出しが例外になった GET/HEAD（X-Active-Worker: blue-fallback）
 * Vercel への転送が例外になった API 以外の GET/HEAD も、同じフォールバックでここへ来る。
 *
 * ランキングの読み方（世代ポインタ・キー・gzip・再試行・HTML エンティティのデコード）は Green と同じ
 * workers/utils の部品を使う。要求の処理は Green と共有しない: 不具合のある Green の配備や、Green の isolate に
 * 載るタグ索引のメモリ消費に、待機系まで引きずられないようにするため。
 * Green と同じ本文になることは __tests__/unit/workers-blue-gateway.test.ts で確かめる。
 *
 * 実装状況 (2026-10-04更新):
 * ✅ /api/ranking - 現在の世代のランキング（タグ別を含む）。本文とレート制限の上限は Green と同じ
 * ✅ /api/metadata - 現在の世代のメタデータ
 *   どちらも空のタグ・404・429・500 を含むすべての応答を no-store にする（ルーター経由の Green と同じ）
 * ✅ /api/debug - デバッグ情報（WORKER_AUTH_KEY の認証が無ければ 404）
 * ✅ /api/thumbnail/{videoId} - サムネイル取得API (KVキャッシュなし、CDNキャッシュのみ)
 * ✅ /admin, /api/admin/* - Vercel へだけ中継し、no-store を付ける
 * ✅ その他（/api/popular-tags・/api/tags/autocomplete・/api/hd-thumbnail など）- Vercel のサイトへ中継
 *
 * 注意事項:
 * - タグ候補は索引を持たず Vercel へ中継する（Vercel の route が Green の答えを確かめて 5 分持つ）。
 *   辞書の索引は大きいので、待機系の isolate に Green と同じメモリの負担を持ち込まない
 * - サムネイルAPIはKVキャッシュを使用しない（個人差でキャッシュヒット率が低いため）
 * - CDNレベルでキャッシュ: ブラウザ1時間、CDN24時間
 * - サムネイル取得にはnicovideo.gayミラーサイトを使用
 */

/// <reference types="@cloudflare/workers-types" />

import { decodeRankingData } from './utils/html-decode'
import { applyCORSHeaders, createOptionsResponse } from './utils/cors-config'
import { hasWorkerDebugAccess } from './utils/debug-auth'
import { readR2Json } from './utils/r2-json.js'
import { currentGeneration, rankingKey } from './utils/ranking-generation.js'
import { R2_SERVER_ERROR_CODES, withR2Retry } from './utils/r2-retry.js'

interface Env {
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY?: string
  R2_BUCKET: R2Bucket
  RANKING_DATA: KVNamespace
  RATE_LIMITER: RateLimit // Cloudflare Rate Limiting binding
}

// ルーターと監視が Green と見分けるための版の名前（Blue が返す応答に付ける）
const WORKER_VERSION = 'blue-20250706-unified-cors'
// 本番エイリアス（ルーター・Green と同じ）
const DEFAULT_VERCEL_URL = 'https://nico-ranking-custom-yjsns-projects.vercel.app'

// セキュリティヘッダー定義（Green・ルーターと同じ）
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.vercel-scripts.com https://vercel.live https://static.cloudflareinsights.com https://*.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; media-src 'self' https:; object-src 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-DNS-Prefetch-Control': 'on'
}

// CORSヘッダーは ./utils/cors-config.ts で統一管理

// ランキングとメタデータはブラウザにも CDN にも残さない。通常の経路ではルーターが Green の応答を no-store に
// 書き換えるが、フォールバックでは Blue の応答をそのまま返すため、Blue は空のタグ・404・429・500 にも自分で付ける
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
}

// R2 の一時障害（10001 内部エラー / 10043 一時停止）は、Green と同じく短い間隔で 2 回まで読み直す
const R2_READ_RETRY = { retryableCodes: R2_SERVER_ERROR_CODES, delaysMs: [50, 150] }

function readR2(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return withR2Retry(() => bucket.get(key), R2_READ_RETRY)
}

/** currentGeneration に渡す、再試行付きの読み取り口 */
function retryingR2Reader(bucket: R2Bucket): { get: (key: string) => Promise<R2ObjectBody | null> } {
  return { get: (key) => readR2(bucket, key) }
}

/** Blue の版の名前と CORS・セキュリティヘッダーを付けた JSON 応答 */
function jsonResponse(request: Request, body: unknown, status: number, headers: Record<string, string>): Response {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Worker-Version': WORKER_VERSION, ...headers },
  })
  return applyCORSHeaders(response, request.headers.get('Origin'), securityHeaders)
}

/**
 * IP別レート制限チェック（ランキング・サムネイル取得API用）。上限を超えていれば 429 を返す。
 * 上限は wrangler-blue-20250706.toml の RATE_LIMITER（20リクエスト/分、Green と同じ）
 */
async function checkRateLimit(request: Request, env: Env, endpoint: string): Promise<Response | null> {
  try {
    // クライアントIPを取得（Cloudflare経由）
    const clientIP = request.headers.get('CF-Connecting-IP') ||
                     request.headers.get('X-Forwarded-For') ||
                     'unknown'
    // レート制限キー（IP + エンドポイント + blue）。Green と同じ namespace_id（1001）を使うため、キーを分ける。
    // 同じキーだと、Green が数えてから例外になりルーターがここへ送り直した要求を 2 回数え、障害中の上限が半分になる
    const { success } = await env.RATE_LIMITER.limit({ key: `${clientIP}:${endpoint}:blue` })
    if (success) return null
  } catch (error) {
    console.error('Rate limit check failed:', error)
    // レート制限エラーの場合はリクエストを通す（フェイルオープン）
    return null
  }

  const errorResponse = new Response(
    JSON.stringify({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: 60
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        // 上限超過の応答は CDN に残さない（残ると同じ URL の別の利用者まで 429 になる）
        ...NO_STORE_HEADERS,
        'Retry-After': '60',
        'X-RateLimit-Limit': '20',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': Math.floor(Date.now() / 1000 + 60).toString(),
        'X-Worker-Version': WORKER_VERSION
      }
    }
  )
  return applyCORSHeaders(errorResponse, request.headers.get('Origin'), {})
}

/**
 * ETagが一致するかチェック（Green と同じ比較）
 */
function isETagMatch(currentETag: string, ifNoneMatch: string | null): boolean {
  if (!ifNoneMatch) return false

  // ワイルドカードの場合
  if (ifNoneMatch.trim() === '*') return true

  // weak比較（W/プレフィックスを無視）
  const normalizeETag = (etag: string): string => etag.replace(/^W\//, '')
  const normalizedCurrent = normalizeETag(currentETag)

  // カンマ区切りのETagリストをチェック
  return ifNoneMatch.split(',').some((etag) => normalizeETag(etag.trim()) === normalizedCurrent)
}

/** 世代を指す前のランキングのキー。タグ名は URL エンコードしてキーに入れる（Green・パイプラインと同じ） */
function legacyRankingKey(genre: string, period: string, tag: string): string {
  return tag
    ? `rankings/${genre}/${period}/tags/${encodeURIComponent(tag)}.json`
    : `rankings/${genre}/${period}/all.json`
}

/**
 * /api/ranking。現在の世代（rankings/current.json）のランキングを読み、HTML エンティティをデコードして返す。
 * 世代ポインタが無いときだけ旧来のキーを読み、読めないポインタは例外にする（古いデータを混ぜない）。
 * ログには利用者のタグ名や R2 のキーを出さない
 */
async function handleRanking(request: Request, url: URL, env: Env): Promise<Response> {
  const genre = url.searchParams.get('genre') || 'all'
  const period = url.searchParams.get('period') || '24h'
  const tag = url.searchParams.get('tag') || ''

  try {
    const manifest = await currentGeneration(retryingR2Reader(env.R2_BUCKET))
    const r2Object = await readR2(env.R2_BUCKET, rankingKey(manifest, legacyRankingKey(genre, period, tag)))

    if (!r2Object) {
      if (tag) {
        // タグ別データが存在しない（人気タグでない）場合は空の結果を返す。
        // Green は 5 分キャッシュを付けるがルーターが no-store に書き換える。Blue はフォールバックでも残らないよう no-store
        return jsonResponse(request, {
          items: [],
          popularTags: [],
          metadata: { version: 1, updatedAt: new Date().toISOString(), genre, period, tag }
        }, 200, { ...NO_STORE_HEADERS, 'X-Data-Source': 'r2-tag-not-found' })
      }
      // 404 を返すのは、世代の中にそのランキングが本当に無いときだけ。次の世代で現れることがあるので残さない
      return jsonResponse(request, {
        error: 'Ranking data not found',
        message: `No data available for ${genre}/${period}`
      }, 404, { ...NO_STORE_HEADERS, 'X-Data-Source': 'r2-not-found' })
    }

    const etag = r2Object.httpEtag || `"${r2Object.etag}"`
    const rankingHeaders = {
      ...NO_STORE_HEADERS,
      'ETag': etag,
      'X-Ranking-Generation': manifest?.generation || 'legacy',
      'X-Worker-Version': WORKER_VERSION
    }

    // If-None-Matchチェック
    if (isETagMatch(etag, request.headers.get('If-None-Match'))) {
      r2Object.body.cancel().catch(() => undefined)
      const notModifiedResponse = new Response(null, { status: 304, headers: rankingHeaders })
      return applyCORSHeaders(notModifiedResponse, request.headers.get('Origin'), securityHeaders)
    }

    // gzip は宣言（Content-Encoding）か先頭のバイトで見分けて展開する
    const { data } = await readR2Json(r2Object)
    const rankingResponse = new Response(JSON.stringify(decodeRankingData(data)), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Data-Source': 'r2-direct', ...rankingHeaders }
    })
    return applyCORSHeaders(rankingResponse, request.headers.get('Origin'), securityHeaders)
  } catch (error) {
    console.error('[Blue Worker] Failed to read ranking data:', error instanceof Error ? error.message : String(error))
    // 待機系のエラーはどこにも残さない（次の要求では読めることがある）
    return jsonResponse(request, {
      error: 'Internal server error',
      message: 'Failed to fetch ranking data'
    }, 500, NO_STORE_HEADERS)
  }
}

/** /api/metadata。現在の世代のメタデータをそのまま返す。読めないときは Green と同じく空のオブジェクト */
async function handleMetadata(request: Request, env: Env): Promise<Response> {
  try {
    const manifest = await currentGeneration(retryingR2Reader(env.R2_BUCKET))
    const metadataObject = await readR2(env.R2_BUCKET, rankingKey(manifest, 'rankings/metadata.json'))
    if (metadataObject) {
      const { text } = await readR2Json(metadataObject)
      const metadataResponse = new Response(text, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...NO_STORE_HEADERS,
          'ETag': metadataObject.httpEtag || `"${metadataObject.etag}"`,
          'X-Ranking-Generation': manifest?.generation || 'legacy',
          'X-Worker-Version': WORKER_VERSION
        }
      })
      return applyCORSHeaders(metadataResponse, request.headers.get('Origin'), securityHeaders)
    }
  } catch (error) {
    console.error('[Blue Worker] Failed to read metadata:', error instanceof Error ? error.message : String(error))
  }
  const emptyResponse = new Response('{}', {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...NO_STORE_HEADERS, 'X-Worker-Version': WORKER_VERSION }
  })
  return applyCORSHeaders(emptyResponse, request.headers.get('Origin'), securityHeaders)
}

/**
 * /api/debug。デバッグ情報は WORKER_AUTH_KEY の認証が無ければ返さない（Green と同じ）。
 * 要求のヘッダーは返さない。版の名前は監視が HEAD で読めるよう 404 にも付ける
 */
function handleDebug(request: Request, env: Env): Response {
  const origin = request.headers.get('Origin')
  if (!hasWorkerDebugAccess(request, env.WORKER_AUTH_KEY)) {
    const notFoundResponse = new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain', 'X-Worker-Version': WORKER_VERSION }
    })
    return applyCORSHeaders(notFoundResponse, origin, securityHeaders)
  }

  const debugResponse = new Response(JSON.stringify({
    time: new Date().toISOString(),
    worker: 'api-gateway-blue-20250706',
    version: WORKER_VERSION,
    features: ['r2-generations', 'html-decode', 'unified-cors', 'blue-20250706']
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Worker-Version': WORKER_VERSION }
  })
  return applyCORSHeaders(debugResponse, origin, securityHeaders)
}

/**
 * Vercel のサイトへ中継する（Green の proxyToVercel と同じ扱い）。
 * fetchUpstream が X-Worker-Auth と Host を落とし、同じオリジンの安全なリダイレクトだけをたどる
 */
async function proxyToVercel(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin')
  try {
    const response = await fetchUpstream(request, env.VERCEL_DEPLOYMENT_URL || DEFAULT_VERCEL_URL)
    const responseHeaders = new Headers(response.headers)
    Object.entries(securityHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value)
    })
    const proxyResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    })
    return applyCORSHeaders(proxyResponse, origin, {})
  } catch (error) {
    console.error('[Blue Worker] Proxy error:', error instanceof Error ? error.message : String(error))
    const proxyErrorResponse = new Response('Gateway Error', {
      status: 502,
      headers: { 'Content-Type': 'text/plain' }
    })
    return applyCORSHeaders(proxyErrorResponse, origin, {})
  }
}

const handler: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (isAdminPath(url.pathname)) {
      try {
        return noStore(await fetchUpstream(request, env.VERCEL_DEPLOYMENT_URL || DEFAULT_VERCEL_URL))
      } catch {
        return noStore(new Response('Gateway Error', { status: 502 }))
      }
    }

    // OPTIONS リクエストの処理
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin')
      return createOptionsResponse(origin)
    }

    if (url.pathname === '/api/debug') {
      return handleDebug(request, env)
    }

    if (url.pathname === '/api/metadata') {
      return handleMetadata(request, env)
    }

    if (url.pathname === '/api/ranking') {
      // レート制限チェック（ランキングAPI用）
      const limited = await checkRateLimit(request, env, 'ranking')
      if (limited) return limited
      return handleRanking(request, url, env)
    }

    // /api/thumbnail/{videoId} パスの処理
    if (url.pathname.startsWith('/api/thumbnail/')) {
      try {
        const videoId = url.pathname.split('/').pop()
        
        if (!videoId || !/^[a-zA-Z0-9_-]+$/.test(videoId)) {
          const invalidIdResponse = new Response(JSON.stringify({ error: 'Invalid video ID' }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json'
            }
          })
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(invalidIdResponse, origin, securityHeaders)
        }
        
        // レート制限チェック（サムネイル取得API用）
        const limited = await checkRateLimit(request, env, 'thumbnail')
        if (limited) return limited
        
        // ニコニコ動画から動画ページを取得（キャッシュなし）
        // nico-thumb-appのロジックを参考に、ミラーサイトとUser-Agent偽装を使用
        const nicoResponse = await fetch(`https://www.nicovideo.gay/watch/${videoId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept-Language': 'ja,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        })
        
        if (!nicoResponse.ok) {
          const notFoundResponse = new Response(JSON.stringify({ error: 'Video not found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json'
            }
          })
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(notFoundResponse, origin, securityHeaders)
        }
        
        // HTMLからOGP画像URLを抽出
        const html = await nicoResponse.text()
        const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
        let thumbnailUrl = ogImageMatch ? ogImageMatch[1] : null
        
        // サムネイルURLを大きいサイズに変換
        if (thumbnailUrl) {
          // nico-thumb-appの方法を参考に、より確実な変換を行う
          
          // originalサイズのURLの場合はそのまま使用
          if (thumbnailUrl.includes('.original') || thumbnailUrl.includes('/original/')) {
            console.log('Already original size thumbnail:', thumbnailUrl)
          } else {
            // ニコニコ動画のサムネイルURL形式
            // 例: https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678
            // 例: https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678.M
            
            // クエリパラメータを分離
            const [urlBase, urlQuery] = thumbnailUrl.split('?')
            
            // 既存のサイズ指定を削除（.数字の後の.Mや.Lを削除）
            let cleanUrl = urlBase.replace(/\.(M|L)($|\/)/g, '$2')
            
            // .Lを追加（拡張子の前または末尾に）
            if (cleanUrl.match(/\.\d+$/)) {
              // 数字で終わる場合（例: 12345678.12345678）
              cleanUrl = cleanUrl + '.L'
            } else if (cleanUrl.match(/\.\d+\//)) {
              // 数字の後にスラッシュがある場合
              cleanUrl = cleanUrl.replace(/(\.\d+)(\/)/g, '$1.L$2')
            } else {
              // その他の場合は末尾に追加
              cleanUrl = cleanUrl + '.L'
            }
            
            // クエリパラメータを再結合
            thumbnailUrl = urlQuery ? `${cleanUrl}?${urlQuery}` : cleanUrl
            console.log('Converted to large thumbnail:', thumbnailUrl)
          }
        }
        
        const result = JSON.stringify({ 
          videoId,
          thumbnail: thumbnailUrl
        })
        
        const thumbnailResponse = new Response(result, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            // CDNレベルでのキャッシュのみ（個人差があるためKVキャッシュは使用しない）
            'Cache-Control': 'public, max-age=3600, s-maxage=86400' // ブラウザ1時間、CDN24時間
          }
        })
        
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(thumbnailResponse, origin, securityHeaders)
        
      } catch (error) {
        console.error('Error fetching thumbnail:', error)
        const errorResponse = new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json'
          }
        })
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(errorResponse, origin, securityHeaders)
      }
    }

    // その他のリクエスト（人気タグ・タグ候補・HDサムネイルなど）はVercelに転送
    return proxyToVercel(request, env)
  }
}

export default handler
