/**
 * Cloudflare Worker - Green Worker 20250726 with Dynamic TTL & ETag Support
 * Smart Router用Green Worker（動的TTL & ETag対応、2025-07-26版）
 * 
 * 🟢 現在アクティブなWorker (本番環境で使用中)
 * Blue/Green デプロイメント戦略において、このGreen Workerが現在稼働中です
 * 
 * Features:
 * - Dynamic TTL based on actual update schedule (0, 20, 40 minutes)
 * - ETag support for conditional requests
 * - R2 direct access with HTML entity decoding
 * - Smart Router Green Worker deployment
 * - Tag autocomplete API for search functionality
 * 
 * 実装状況 (2025-07-26更新):
 * ✅ /api/ranking - R2からランキングデータ取得（動的TTL対応、1000件対応）
 * ✅ /api/metadata - メタデータ取得
 * ✅ /api/debug - デバッグ情報
 * ✅ /api/thumbnail/{videoId} - サムネイル取得API (KVキャッシュなし、CDNキャッシュのみ)
 * ✅ /api/tags/autocomplete - タグオートコンプリートAPI (R2からタグ累積データ取得)
 * 
 * 注意事項:
 * - サムネイルAPIはKVキャッシュを使用しない（個人差でキャッシュヒット率が低いため）
 * - CDNレベルでキャッシュ: ブラウザ1時間、CDN24時間
 * - サムネイル取得にはnicovideo.gayミラーサイトを使用
 * - html-decode.tsで最大1000件制限に変更済み（2025-07-26）
 */

/// <reference types="@cloudflare/workers-types" />

import { timingSafeEqual } from 'node:crypto'
import { decodeRankingData } from './utils/html-decode'
import { applyCORSHeaders, createOptionsResponse } from './utils/cors-config'
import { handleWithCache } from './utils/cache-handler'
import { hasWorkerDebugAccess } from './utils/debug-auth'
import { readR2Json } from './utils/r2-json.js'
import { currentGeneration, rankingKey } from './utils/ranking-generation.js'
import { R2_SERVER_ERROR_CODES, withR2Retry } from './utils/r2-retry.js'
import { Sentry, captureWorkerException, createWorkerSentryOptions, sanitizeUrlForSentry } from './sentry.js'

interface Env {
  R2_BUCKET: R2Bucket
  RANKING_DATA: KVNamespace
  MAINTENANCE_FLAGS: KVNamespace
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY?: string
  RATE_LIMITER: RateLimit // Cloudflare Rate Limiting binding
  SEARCH_RATE_LIMITER?: RateLimit // /api/search 系専用（workers/wrangler-green.toml）
  SENTRY_WORKER_DSN?: string
  ENVIRONMENT?: string
  CF_VERSION_METADATA?: {
    id?: string
  }
}

// タグ累積データの型定義
interface TagAccumulationData {
  tags: string[]
  metadata: {
    version: number
    lastUpdated: string
    totalUniqueTags: number
    lastAccumulationSource: string
    weeklyUpdateCount: number
  }
}

// セキュリティヘッダー定義
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

// R2 の一時障害（10001 内部エラー / 10043 一時停止）は、短い間隔で 2 回まで読み直す
const R2_READ_RETRY = { retryableCodes: R2_SERVER_ERROR_CODES, delaysMs: [50, 150] }

function readR2(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return withR2Retry(() => bucket.get(key), R2_READ_RETRY)
}

/** currentGeneration に渡す、再試行付きの読み取り口 */
function retryingR2Reader(bucket: R2Bucket): { get: (key: string) => Promise<R2ObjectBody | null> } {
  return { get: (key) => readR2(bucket, key) }
}

/**
 * IP×エンドポイントごとのレート制限チェック。上限は各バインディングの設定（wrangler の simple.limit）。
 * 制限に掛かったときは 429 の応答を、通すときは null を返す
 */
async function checkRateLimit(
  request: Request,
  limiter: RateLimit,
  endpoint: string = 'general',
  workerAuthKey?: string,
): Promise<Response | null> {
  // サイトのサーバー（SSR・/api/ranking/full など）は Vercel の少数の送信元 IP から来るため、IP では数えない
  if (hasWorkerKey(request, workerAuthKey)) {
    return null
  }
  try {
    // クライアントIPを取得（Cloudflare経由）
    const clientIP = request.headers.get('CF-Connecting-IP') || 
                     request.headers.get('X-Forwarded-For') || 
                     'unknown'
    
    // レート制限キー（IP + エンドポイント）
    const limitKey = `${clientIP}:${endpoint}`
    
    // Rate Limiting API（上限はバインディングごとの wrangler 設定）
    const { success } = await limiter.limit({
      key: limitKey
    })
    
    if (!success) {
      const rateLimitErrorResponse = new Response(
        JSON.stringify({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: 60
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
            'X-RateLimit-Limit': '600',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.floor(Date.now() / 1000 + 60).toString()
          }
        }
      )
      
      // Apply CORS headers to rate limit error
      const origin = request.headers.get('Origin')
      return applyCORSHeaders(rateLimitErrorResponse, origin, {})
    }
    
    return null
  } catch (error) {
    console.error('Rate limit check failed:', error)
    captureWorkerException(error, {
      tags: {
        runtime: 'cloudflare-worker',
        surface: 'api-gateway-green',
        endpoint_family: endpoint === 'general' ? sanitizeUrlForSentry(request.url) || 'worker' : endpoint,
        upstream_kind: 'rate-limit',
        worker_version: 'green-20250726',
      },
    })
    // レート制限エラーの場合はリクエストを通す（フェイルオープン）
    return null
  }
}

// ニコニコ動画のサムネイル画像を配る CDN。サイト側 lib/thumbnail-hosts.ts の THUMBNAIL_HOSTS と同じ値にする
// （Worker からは import できないため値を揃えて持つ）。/api/hd-thumbnail が返してよい URL はこれに限る
const THUMBNAIL_HOSTS: ReadonlySet<string> = new Set([
  'nicovideo.cdn.nimg.jp',
  'img.cdn.nimg.jp',
  'tn.smilevideo.jp',
  'tn-skr1.smilevideo.jp',
  'tn-skr2.smilevideo.jp',
  'tn-skr3.smilevideo.jp',
  'tn-skr4.smilevideo.jp',
])

// HD サムネイルの 1 か所の取得（本文の読み取りを含む）の期限。ミラーが遅くても nicovideo.jp を読む時間を残す
const HD_THUMBNAIL_SOURCE_TIMEOUT_MS = 4_000

/** https で、サムネイルの CDN を指す URL か（外部のページから得た URL を利用者へ返す前に確かめる） */
function isThumbnailCdnUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  return parsed.protocol === 'https:' && THUMBNAIL_HOSTS.has(parsed.hostname)
}

/** .M / .L を外し、.original を付けて最大サイズの URL にする */
function toOriginalSizeUrl(thumbnailUrl: string): string {
  const [urlBase = '', urlQuery] = thumbnailUrl.split('?')
  let originalUrl = urlBase.replace(/\.(M|L)($|\/)/g, '$2')
  if (!originalUrl.includes('.original')) {
    originalUrl = originalUrl.replace(/(\.\d+)($|\/)/g, '$1.original$2')
  }
  return urlQuery ? `${originalUrl}?${urlQuery}` : originalUrl
}

/**
 * og:image（無ければ thumbnail の meta）から HD サムネイルの URL を取り出す。
 * ページの値は信用しない: サムネイル CDN の https URL でなければ採用しない
 * （利用者はこの URL をプロキシ経由で保存し、だめなら新しいタブで開く）
 */
function extractHdThumbnailUrl(html: string): string | null {
  // 属性の順序が異なる場合も対応（content が先にくる場合）
  const ogImageMatch = html.match(/<meta[^>]+(?:property=["']og:image["'][^>]+content=["']([^"']+)["']|content=["']([^"']+)["'][^>]+property=["']og:image["'])/i)
  const ogImage = ogImageMatch ? ogImageMatch[1] || ogImageMatch[2] : undefined
  if (ogImage && isThumbnailCdnUrl(ogImage)) {
    // 1280x720 / .original はそのまま、それ以外は .original で最大サイズを試す
    return ogImage.includes('1280x720') || ogImage.includes('.original') ? ogImage : toOriginalSizeUrl(ogImage)
  }

  const thumbnailMatch = html.match(/<meta[^>]+name=["']thumbnail["'][^>]+content=["']([^"']+)["']/i)
  const thumbnail = thumbnailMatch?.[1]
  if (thumbnail && isThumbnailCdnUrl(thumbnail)) {
    return toOriginalSizeUrl(thumbnail)
  }

  return null
}

/**
 * ログ用の R2 キー。console の出力は Sentry のパンくずにも載るため、利用者が入力したタグ名は伏せる
 */
function loggableRankingKey(key: string): string {
  return key.replace(/\/tags\/[^/]+\.json$/, '/tags/<tag>.json')
}

/**
 * サイトのサーバーからの要求か（X-Worker-Auth が WORKER_AUTH_KEY と一致するか。比較は一定時間で行う）。
 * Authorization は別オリジンへのリダイレクトで落とされるため、301 を追うサイトの取得でも残る X-Worker-Auth を使う
 */
function hasWorkerKey(request: Request, workerAuthKey?: string): boolean {
  const presented = request.headers.get('X-Worker-Auth')
  if (!workerAuthKey || !presented) return false
  const expected = new TextEncoder().encode(workerAuthKey)
  const actual = new TextEncoder().encode(presented)
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected)
}

/**
 * /api/search 系のレート制限キー（エンドポイント名）。検索 1 回で owners / realtime-tags が
 * 数回ずつ呼ばれるため、エンドポイントごとに数える。%xx や重複スラッシュで制限を外せないよう正規化する
 */
function searchRateLimitEndpoint(pathname: string): string | null {
  let path = pathname
  try {
    path = decodeURIComponent(pathname)
  } catch {
    // 不正な %xx はそのまま扱う
  }
  path = path.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  if (path === '/api/search/owners') return 'search-owners'
  if (path === '/api/search/realtime-tags') return 'search-realtime-tags'
  if (path === '/api/search' || path.startsWith('/api/search/')) return 'search'
  return null
}

/**
 * 動的TTL計算 20250922修正版
 * 実際の更新スケジュール（毎時20,50分）に最適化
 * GitHub Actions cron: '20,50 * * * *' (実際のスケジュール)
 */
function calculateDynamicTTL() {
  const now = new Date()
  const currentMinute = now.getMinutes()

  // 次の更新時刻を計算（毎時20,50分）
  let nextUpdateMinute: number
  let hoursToAdd = 0

  if (currentMinute < 20) {
    // 0-19分：次は20分
    nextUpdateMinute = 20
  } else if (currentMinute < 50) {
    // 20-49分：次は50分
    nextUpdateMinute = 50
  } else {
    // 50-59分：次は翌時の20分
    nextUpdateMinute = 20
    hoursToAdd = 1
  }
  
  // 次の更新時刻のDateオブジェクトを作成
  const nextUpdate = new Date(now)
  nextUpdate.setHours(now.getHours() + hoursToAdd)
  nextUpdate.setMinutes(nextUpdateMinute)
  nextUpdate.setSeconds(0)
  nextUpdate.setMilliseconds(0)
  
  // 次の更新時刻までの秒数を計算
  const secondsUntilUpdate = Math.floor((nextUpdate.getTime() - now.getTime()) / 1000)
  
  // 20250922 TTL戦略：20,50分スケジュールに最適化
  // 更新間隔30分を考慮した段階的TTL
  // Browser: 15分（更新間隔の半分）
  // CDN: 25分（更新間隔よりやや短め）
  // Worker: 動的（次の更新までの時間に基づく）

  // 次の更新までの時間に基づいた動的TTL
  let browserTTL: number
  let cdnTTL: number

  if (secondsUntilUpdate > 1500) {
    // 25分以上ある場合（更新直後）
    browserTTL = 900      // 15分
    cdnTTL = 1500        // 25分
  } else if (secondsUntilUpdate > 600) {
    // 10-25分の場合（中間期）
    browserTTL = 600      // 10分
    cdnTTL = 900         // 15分
  } else {
    // 10分未満の場合（更新近づく）
    browserTTL = 300      // 5分
    cdnTTL = 300         // 5分
  }

  const workerTTL = Math.min(secondsUntilUpdate - 120, 1680) // 更新2分前まで、最大28分
  
  // 安全な最小値を設定（更新遅延を考慮）
  const safeCdnTTL = Math.max(cdnTTL, 180)   // 最低3分
  const safeWorkerTTL = Math.max(workerTTL, 120) // 最低2分
  
  // Cache-Controlヘッダーを生成
  // stale-while-revalidate: 5分（更新遅延許容）
  // stale-if-error: 60分（障害時の可用性確保）
  const cacheControl = `public, max-age=${browserTTL}, s-maxage=${safeCdnTTL}, stale-while-revalidate=300, stale-if-error=3600`
  const cdnCacheControl = `public, max-age=${safeCdnTTL}`
  
  return {
    cacheControl,
    cdnCacheControl,
    workerTTL: safeWorkerTTL,
    secondsUntilUpdate,
    debugInfo: {
      currentMinute,
      nextUpdateMinute,
      hoursToAdd,
      browserTTL,
      cdnTTL: safeCdnTTL,
      calculatedWorkerTTL: workerTTL,
      safeWorkerTTL: safeWorkerTTL,
      updateSchedule: '20,50分',
      ttlStrategy: '動的段階的TTL'
    }
  }
}

/**
 * ETagが一致するかチェック
 */
function isETagMatch(currentETag: string, ifNoneMatch: string | null): boolean {
  if (!ifNoneMatch) return false
  
  // ワイルドカードの場合
  if (ifNoneMatch.trim() === '*') return true
  
  // weak比較（W/プレフィックスを無視）
  const normalizeETag = (etag: string) => etag.replace(/^W\//, '')
  const normalizedCurrent = normalizeETag(currentETag)
  
  // カンマ区切りのETagリストをチェック
  const etags = ifNoneMatch.split(',').map(e => e.trim())
  return etags.some(etag => normalizeETag(etag) === normalizedCurrent)
}

const handler: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // OPTIONS リクエストの処理
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin')
      return createOptionsResponse(origin)
    }
    
    // /api/debug エンドポイント
    if (url.pathname === '/api/debug') {
      if (!hasWorkerDebugAccess(request, env.WORKER_AUTH_KEY)) {
        const origin = request.headers.get('Origin')
        const notFoundResponse = new Response('Not Found', {
          status: 404,
          headers: {
            'Content-Type': 'text/plain',
          },
        })
        return applyCORSHeaders(notFoundResponse, origin, securityHeaders)
      }

      const { debugInfo, secondsUntilUpdate } = calculateDynamicTTL()
      
      const debugOutput = {
        time: new Date().toISOString(),
        worker: 'api-gateway-green-20250726',
        version: 'green-20250726-dynamic-ttl',
        features: ['dynamic-ttl', 'etag-support', 'html-decode', 'smart-router-compatible'],
        dynamicTTL: {
          ...debugInfo,
          secondsUntilUpdate,
          nextUpdateTime: new Date(Date.now() + secondsUntilUpdate * 1000).toISOString()
        }
      };
      
      const debugResponse = new Response(JSON.stringify(debugOutput, null, 2), {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json',
          'X-Worker-Version': 'green-20250726-unified-cors'
        }
      })
      
      const origin = request.headers.get('Origin')
      return applyCORSHeaders(debugResponse, origin, securityHeaders)
    }
    
    // /api/metadata パスの処理
    if (url.pathname === '/api/metadata' && env.R2_BUCKET) {
      try {
        const manifest = await currentGeneration(retryingR2Reader(env.R2_BUCKET))
        const metadataObject = await readR2(env.R2_BUCKET, rankingKey(manifest, 'rankings/metadata.json'))
        if (metadataObject) {
          const { cacheControl } = calculateDynamicTTL()
          const { text: metadataText } = await readR2Json(metadataObject)
          
          const metadataResponse = new Response(metadataText, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': cacheControl,
              'ETag': metadataObject.httpEtag || `"${metadataObject.etag}"`,
              'X-Ranking-Generation': manifest?.generation || 'legacy',
              'X-Worker-Version': 'green-20250726-unified-cors'
            }
          })
          
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(metadataResponse, origin, securityHeaders)
        }
      } catch (error) {
        console.error('Metadata read error:', error)
        captureWorkerException(error, {
          tags: {
            runtime: 'cloudflare-worker',
            surface: 'api-gateway-green',
            endpoint_family: '/api/metadata',
            upstream_kind: 'r2-read',
            worker_version: 'green-20250726',
          },
        })
      }
      const emptyResponse = new Response('{}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      const origin = request.headers.get('Origin')
      return applyCORSHeaders(emptyResponse, origin, securityHeaders)
    }

    // タグオートコンプリートAPI
    if (url.pathname === '/api/tags/autocomplete' && env.R2_BUCKET) {
      try {
        const query = url.searchParams.get('q') || ''
        
        // クエリが空または2文字未満の場合は空の結果を返す
        if (!query || query.trim().length < 2) {
          const emptyResponse = new Response(JSON.stringify({
            query,
            suggestions: [],
            metadata: {
              total: 0,
              source: 'query-too-short'
            }
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300' // 5分キャッシュ
            }
          })
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(emptyResponse, origin, securityHeaders)
        }

        // R2からタグ累積データを取得
        const tagAccumulationObject = await readR2(env.R2_BUCKET, 'tag-accumulation.json')
        
        if (!tagAccumulationObject) {
          // タグ累積データが存在しない場合
          const notFoundResponse = new Response(JSON.stringify({
            query,
            suggestions: [],
            metadata: {
              total: 0,
              source: 'tag-data-not-found',
              error: 'Tag accumulation data not available'
            }
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=60' // 1分キャッシュ
            }
          })
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(notFoundResponse, origin, securityHeaders)
        }

        // タグ累積データを解析
        let tagData: TagAccumulationData
        try {
          const { data } = await readR2Json(tagAccumulationObject)
          tagData = data as TagAccumulationData
        } catch (parseError) {
          console.error('Failed to parse tag accumulation data:', parseError)
          captureWorkerException(parseError, {
            tags: {
              runtime: 'cloudflare-worker',
              surface: 'api-gateway-green',
              endpoint_family: '/api/tags/autocomplete',
              upstream_kind: 'r2-parse',
              worker_version: 'green-20250726',
            },
          })
          const errorResponse = new Response(JSON.stringify({
            query,
            suggestions: [],
            metadata: {
              total: 0,
              source: 'parse-error',
              error: 'Failed to parse tag data'
            }
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            }
          })
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(errorResponse, origin, securityHeaders)
        }

        // プレフィックス検索を実行
        const lowerQuery = query.toLowerCase()
        const maxResults = parseInt(url.searchParams.get('limit') || '10')
        const suggestions = (tagData.tags || [])
          .filter((tag: string) => tag.toLowerCase().startsWith(lowerQuery))
          .slice(0, maxResults)

        // レスポンスを構築
        const autocompleteResponse = {
          query,
          suggestions,
          metadata: {
            total: suggestions.length,
            maxResults,
            source: 'r2-tag-accumulation',
            lastUpdated: tagData.metadata?.lastUpdated || null,
            totalUniqueTags: tagData.metadata?.totalUniqueTags || 0
          }
        }

        const response = new Response(JSON.stringify(autocompleteResponse), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=1800' // 30分キャッシュ（タグデータは比較的安定）
          }
        })
        
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(response, origin, securityHeaders)

      } catch (error) {
        console.error('Tag autocomplete error:', error)
        captureWorkerException(error, {
          tags: {
            runtime: 'cloudflare-worker',
            surface: 'api-gateway-green',
            endpoint_family: '/api/tags/autocomplete',
            upstream_kind: 'r2-read',
            worker_version: 'green-20250726',
          },
        })
        const errorResponse = new Response(JSON.stringify({
          query: url.searchParams.get('q') || '',
          suggestions: [],
          metadata: {
            total: 0,
            source: 'error',
            error: error.message
          }
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        })
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(errorResponse, origin, securityHeaders)
      }
    }
    
    // /api/ranking パスの処理 - Cache API対応
    if (url.pathname === '/api/ranking' && env.R2_BUCKET) {
      // レート制限チェック（ランキングAPI用）
      const rateLimited = await checkRateLimit(request, env.RATE_LIMITER, 'ranking', env.WORKER_AUTH_KEY)
      if (rateLimited) {
        return rateLimited
      }

      // Cache APIを使用した処理
      return handleWithCache(url, async () => {
        const genre = url.searchParams.get('genre') || 'all'
        const period = url.searchParams.get('period') || '24h'
        const tag = url.searchParams.get('tag') || ''

        console.log(`[Worker v2.0 + Cache] Request processing - Genre: ${genre}, Period: ${period}, hasTag: ${Boolean(tag)}`)

        try {
        // R2からデータを取得
        const manifest = await currentGeneration(retryingR2Reader(env.R2_BUCKET))
        const legacyKey = tag
          ? `rankings/${genre}/${period}/tags/${encodeURIComponent(tag)}.json`
          : `rankings/${genre}/${period}/all.json`
        const r2Key = rankingKey(manifest, legacyKey)
        
        console.log(`[Worker v2.0] Fetching from R2: ${loggableRankingKey(r2Key)}`)
        const r2Object = await readR2(env.R2_BUCKET, r2Key)
        
        if (!r2Object) {
          if (tag) {
            // タグ別データが存在しない場合は空の結果を返す
            console.log(`[Worker v2.0] Tag data not found for ${loggableRankingKey(r2Key)}, returning empty result`)
            const emptyResponse = {
              items: [],
              popularTags: [],
              metadata: {
                version: 1,
                updatedAt: new Date().toISOString(),
                genre,
                period,
                tag
              }
            }
            const emptyTagResponse = new Response(JSON.stringify(emptyResponse), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                // タグが見つからない場合も短時間キャッシュ（5分）して負荷軽減
                'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
                'X-Data-Source': 'r2-tag-not-found',
                'X-Worker-Version': 'green-20250726-unified-cors',
                'X-Cache-Note': 'Tag not found - cached for 5 minutes to reduce load'
              }
            })
            
            const origin = request.headers.get('Origin')
            return applyCORSHeaders(emptyTagResponse, origin, securityHeaders)
          } else {
            // 通常のランキングデータが存在しない場合は404を返す
            console.log(`[Worker v2.0] R2 miss for ${r2Key}, returning 404`)
            const notFoundResponse = new Response(JSON.stringify({
              error: 'Ranking data not found',
              message: `No data available for ${genre}/${period}`
            }), {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                // 404エラーも短時間キャッシュして負荷軽減
                'Cache-Control': 'public, max-age=60, s-maxage=60',
                'X-Data-Source': 'r2-not-found',
                'X-Worker-Version': 'green-20250726-unified-cors'
              }
            })
            
            const origin = request.headers.get('Origin')
            return applyCORSHeaders(notFoundResponse, origin, securityHeaders)
          }
        }
        
        // ETag取得
        const etag = r2Object.httpEtag || `"${r2Object.etag}"`
        
        // If-None-Matchチェック
        const ifNoneMatch = request.headers.get('If-None-Match')
        if (ifNoneMatch && isETagMatch(etag, ifNoneMatch)) {
          const { workerTTL, secondsUntilUpdate } = calculateDynamicTTL()
          const notModifiedResponse = new Response(null, {
            status: 304,
            headers: {
              'ETag': etag,
              'Cache-Control': 'no-store',
              'CDN-Cache-Control': 'no-store',
              'CF-Cache-Status': 'REVALIDATED',
              'Server-Timing': `cfCache;desc="REVALIDATED", workerTTL;dur=${workerTTL}, nextUpdate;dur=${secondsUntilUpdate}`,
              'X-Worker-Version': 'green-20250726-unified-cors',
              'X-TTL-Source': 'dynamic-20250726'
            }
          })
          
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(notModifiedResponse, origin, {
            ...securityHeaders,
            'Cache-Control': 'no-store',
            'CDN-Cache-Control': 'no-store',
            'Vercel-CDN-Cache-Control': 'no-store'
          })
        }
        
        // 動的TTL v2.0を計算（ログ用途のみ）
        const { workerTTL, secondsUntilUpdate } = calculateDynamicTTL()
        
        // R2から取得したデータを返す
        const headers = new Headers()
        headers.set('Content-Type', 'application/json')
        // キャッシュ禁止（ブラウザ・CDNとも）
        headers.set('Cache-Control', 'no-store')
        headers.set('CDN-Cache-Control', 'no-store')
        headers.set('Vercel-CDN-Cache-Control', 'no-store')
        headers.set('ETag', etag)
        headers.set('X-Ranking-Generation', manifest?.generation || 'legacy')
        headers.set('X-Data-Source', 'r2-direct')
        headers.set('X-Cache-Status', 'MISS')
        headers.set('CF-Cache-Status', 'MISS')
        headers.set('X-Worker-Version', 'green-20250726')
        headers.set('X-TTL-Source', 'dynamic-20250726')
        headers.set('Server-Timing', `cfCache;desc="MISS", workerTTL;dur=${workerTTL}, nextUpdate;dur=${secondsUntilUpdate}`)
        
        // セキュリティヘッダーを追加
        Object.entries(securityHeaders).forEach(([key, value]) => {
          headers.set(key, value)
        })
        
        // R2オブジェクトのメタデータから圧縮情報を取得
        const r2ContentEncoding = r2Object.httpMetadata?.contentEncoding
        
        // HTMLエンティティのデコード処理
        const [passthroughStream, workStream] = r2Object.body.tee()
        
        if (r2ContentEncoding === 'gzip') {
          // gzip圧縮されたデータの場合
          console.log(`[Worker v2.0] Data is gzipped, decompressing and decoding`)
          headers.set('X-Original-Encoding', 'gzip')
          
          try {
            const compressedData = await new Response(passthroughStream).arrayBuffer()
            const decompressedData = await new Response(
              new Blob([compressedData]).stream().pipeThrough(new DecompressionStream('gzip'))
            ).text()
            
            // JSONをパースしてHTMLエンティティをデコード
            try {
              const jsonData = JSON.parse(decompressedData)
              const decodedData = decodeRankingData(jsonData)
              
              const gzipResponse = new Response(JSON.stringify(decodedData), {
                status: 200,
                headers
              })
              
              const origin = request.headers.get('Origin')
              return applyCORSHeaders(gzipResponse, origin, {})
            } catch (parseError) {
              console.error('[Green Worker] Failed to parse or decode JSON:', parseError)
              captureWorkerException(parseError, {
                tags: {
                  runtime: 'cloudflare-worker',
                  surface: 'api-gateway-green',
                  endpoint_family: '/api/ranking',
                  upstream_kind: 'r2-parse',
                  worker_version: 'green-20250726',
                },
              })
              const gzipParseErrorResponse = new Response(decompressedData, {
                status: 200,
                headers
              })
              
              const origin = request.headers.get('Origin')
              return applyCORSHeaders(gzipParseErrorResponse, origin, {})
            }
          } catch (decompressError) {
            console.error('[Green Worker] Failed to decompress gzipped data:', decompressError)
            captureWorkerException(decompressError, {
              tags: {
                runtime: 'cloudflare-worker',
                surface: 'api-gateway-green',
                endpoint_family: '/api/ranking',
                upstream_kind: 'r2-gzip',
                worker_version: 'green-20250726',
              },
            })
            const gzipErrorResponse = new Response(workStream, {
              status: 200,
              headers,
              encodeBody: "manual"
            } as ResponseInit)
            
            const origin = request.headers.get('Origin')
            return applyCORSHeaders(gzipErrorResponse, origin, {})
          }
        } else {
          // 非圧縮データの場合
          console.log(`[Worker v2.0] Data is not gzipped, decoding HTML entities`)
          
          try {
            const textData = await new Response(passthroughStream).text()
            const jsonData = JSON.parse(textData)
            const decodedData = decodeRankingData(jsonData)
            
            const normalResponse = new Response(JSON.stringify(decodedData), {
              status: 200,
              headers
            })
            
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(normalResponse, origin, {
          'Cache-Control': 'no-store',
          'CDN-Cache-Control': 'no-store',
          'Vercel-CDN-Cache-Control': 'no-store'
        })
          } catch (error) {
            console.error('[Green Worker] Failed to parse or decode JSON:', error)
            captureWorkerException(error, {
              tags: {
                runtime: 'cloudflare-worker',
                surface: 'api-gateway-green',
                endpoint_family: '/api/ranking',
                upstream_kind: 'r2-parse',
                worker_version: 'green-20250726',
              },
            })
            const normalErrorResponse = new Response(workStream, {
              status: 200,
              headers
            })
            
            const origin = request.headers.get('Origin')
            return applyCORSHeaders(normalErrorResponse, origin, {})
          }
        }
        
      } catch (error) {
        console.error('[Green Worker] Error fetching from R2:', error)
        captureWorkerException(error, {
          tags: {
            runtime: 'cloudflare-worker',
            surface: 'api-gateway-green',
            endpoint_family: '/api/ranking',
            upstream_kind: 'r2-read',
            worker_version: 'green-20250726',
          },
          contexts: {
            ranking: {
              genre: url.searchParams.get('genre') || 'all',
              period: url.searchParams.get('period') || '24h',
              hasTag: Boolean(url.searchParams.get('tag')),
            },
          },
        })
        const errorResponse = new Response(JSON.stringify({
          error: 'Internal server error',
          message: 'Failed to fetch ranking data'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            // エラー時も短時間キャッシュ
            'Cache-Control': 'public, max-age=30, s-maxage=30',
            'X-Worker-Version': 'green-20250726-unified-cors'
          }
        })

        const origin = request.headers.get('Origin')
        return applyCORSHeaders(errorResponse, origin, securityHeaders)
        }
      }, ctx) // Cache APIのhandleWithCacheクロージング
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
        const rateLimited = await checkRateLimit(request, env.RATE_LIMITER, 'thumbnail', env.WORKER_AUTH_KEY)
        if (rateLimited) {
          return rateLimited
        }
        
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
          const videoNotFoundResponse = new Response(JSON.stringify({ error: 'Video not found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json'
            }
          })
          
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(videoNotFoundResponse, origin, securityHeaders)
        }
        
        // HTMLからサムネイルURLを抽出
        const html = await nicoResponse.text()
        
        let thumbnailUrl = null
        
        // og:imageメタタグを探す（最も確実な方法）
        const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        if (ogImageMatch) {
          thumbnailUrl = ogImageMatch[1]
          console.log('Thumbnail found in og:image:', thumbnailUrl)
        }
        
        // og:imageで見つからない場合は、thumbnailメタタグを試す
        if (!thumbnailUrl) {
          const thumbnailMatch = html.match(/<meta[^>]+name=["']thumbnail["'][^>]+content=["']([^"']+)["']/i)
          if (thumbnailMatch) {
            thumbnailUrl = thumbnailMatch[1]
            console.log('Thumbnail found in thumbnail meta tag:', thumbnailUrl)
          }
        }
        
        // それでも見つからない場合は、JSON-LDを探す
        if (!thumbnailUrl) {
          try {
            // JSON-LDのVideoObjectを探す
            const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
            for (const match of jsonLdMatches) {
              try {
                const jsonLd = JSON.parse(match[1])
                if (jsonLd['@type'] === 'VideoObject' && jsonLd.thumbnailUrl) {
                  if (Array.isArray(jsonLd.thumbnailUrl) && jsonLd.thumbnailUrl.length > 0) {
                    thumbnailUrl = jsonLd.thumbnailUrl[0]
                  } else if (typeof jsonLd.thumbnailUrl === 'string') {
                    thumbnailUrl = jsonLd.thumbnailUrl
                  }
                  if (thumbnailUrl) {
                    console.log('Thumbnail found in JSON-LD:', thumbnailUrl)
                    break
                  }
                }
              } catch (e) {
                // 個別のJSON-LDパースエラーは無視して次を試す
              }
            }
          } catch (e) {
            console.error('Failed to process JSON-LD:', e)
            captureWorkerException(e, {
              tags: {
                runtime: 'cloudflare-worker',
                surface: 'api-gateway-green',
                endpoint_family: '/api/thumbnail/:videoId',
                upstream_kind: 'upstream-parse',
                worker_version: 'green-20250726',
              },
            })
          }
        }
        
        console.log('Final thumbnail URL:', thumbnailUrl)
        
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
            'Cache-Control': 'public, max-age=3600, s-maxage=86400', // ブラウザ1時間、CDN24時間
            'X-Worker-Version': 'green-20250726-unified-cors'
          }
        })
        
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(thumbnailResponse, origin, securityHeaders)
        
      } catch (error) {
        console.error('Error fetching thumbnail:', error)
        captureWorkerException(error, {
          tags: {
            runtime: 'cloudflare-worker',
            surface: 'api-gateway-green',
            endpoint_family: '/api/thumbnail/:videoId',
            upstream_kind: 'thumbnail-fetch',
            worker_version: 'green-20250726',
          },
        })
        const thumbnailErrorResponse = new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json'
          }
        })
        
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(thumbnailErrorResponse, origin, securityHeaders)
      }
    }
    
    // /api/hd-thumbnail/{videoId} パスの処理 - 1280x720高解像度サムネイル取得
    if (url.pathname.startsWith('/api/hd-thumbnail/')) {
      const videoId = url.pathname.replace('/api/hd-thumbnail/', '')
      
      if (!videoId || !/^[a-zA-Z0-9]+$/.test(videoId)) {
        const hdInvalidIdResponse = new Response(JSON.stringify({ error: 'Invalid video ID' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          }
        })
        
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(hdInvalidIdResponse, origin, securityHeaders)
      }
      
      // レート制限チェック（HDサムネイル取得API用）
      const rateLimited = await checkRateLimit(request, env.RATE_LIMITER, 'hd-thumbnail', env.WORKER_AUTH_KEY)
      if (rateLimited) {
        return rateLimited
      }
      
      try {
        console.log(`[HD Thumbnail] Fetching HD thumbnail for ${videoId}`)
        let hdThumbnailUrl: string | null = null
        let source = 'nicovideo.gay'

        // ミラー（nicovideo.gay）を先に試す。so 動画はサイト側と同じく nicovideo.jp から直接取る
        if (!videoId.startsWith('so')) {
          try {
            const response = await fetch(`https://www.nicovideo.gay/watch/${videoId}`, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Accept-Language': 'ja,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
              },
              signal: AbortSignal.timeout(HD_THUMBNAIL_SOURCE_TIMEOUT_MS)
            })
            if (response.ok) {
              hdThumbnailUrl = extractHdThumbnailUrl(await response.text())
            }
          } catch (error) {
            console.warn(`[HD Thumbnail] nicovideo.gay failed for ${videoId}, trying nicovideo.jp`, error)
          }
        }

        // 失敗・期限切れのほか、使える URL が無かったときも nicovideo.jp を読む（og:image は img.cdn.nimg.jp）
        if (!hdThumbnailUrl) {
          source = 'nicovideo.jp'
          const response = await fetch(`https://www.nicovideo.jp/watch/${videoId}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'ja,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(HD_THUMBNAIL_SOURCE_TIMEOUT_MS)
          })
          if (!response.ok) {
            throw new Error(`Failed to fetch from nicovideo.jp: ${response.status}`)
          }
          hdThumbnailUrl = extractHdThumbnailUrl(await response.text())
        }

        const result = {
          videoId,
          thumbnail: hdThumbnailUrl,
          resolution: hdThumbnailUrl ? '1280x720 (HD)' : 'Not available',
          source: `${source} og:image`,
          timestamp: new Date().toISOString()
        }
        
        const hdThumbnailResponse = new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
            'X-HD-Source': source,
            'X-Worker-Version': 'green-20250726-unified-cors'
          }
        })
        
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(hdThumbnailResponse, origin, securityHeaders)
        
      } catch (error) {
        console.error(`[HD Thumbnail] Error for ${videoId}:`, error)
        captureWorkerException(error, {
          tags: {
            runtime: 'cloudflare-worker',
            surface: 'api-gateway-green',
            endpoint_family: '/api/hd-thumbnail/:videoId',
            upstream_kind: 'thumbnail-fetch',
            worker_version: 'green-20250726',
          },
        })
        
        const hdErrorResponse = new Response(JSON.stringify({ 
          error: 'Failed to fetch HD thumbnail',
          videoId,
          details: error.message 
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json'
          }
        })
        
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(hdErrorResponse, origin, securityHeaders)
      }
    }
    
    // /api/search 系は上流でニコニコの検索 API を呼ぶため、Vercel へ渡す前に IP ごとに制限する
    const searchEndpoint = searchRateLimitEndpoint(url.pathname)
    if (searchEndpoint && env.SEARCH_RATE_LIMITER) {
      const rateLimited = await checkRateLimit(request, env.SEARCH_RATE_LIMITER, searchEndpoint, env.WORKER_AUTH_KEY)
      if (rateLimited) {
        return rateLimited
      }
    }

    // 静的ファイルのリクエストをチェック（先にR2から試す）
    const pathname = url.pathname
    const staticFiles = ['/icon.png', '/icon-192.png', '/icon-512.png', '/og-image.png', '/manifest.json', '/robots.txt'];
    const isStaticFile = staticFiles.includes(pathname) || pathname.startsWith('/fonts/') || /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf|eot)$/i.test(pathname)
    
    if (isStaticFile) {
      try {
        const r2Key = pathname.startsWith('/') ? `static${pathname}` : `static/${pathname}`
        console.log(`[Static File 20250726] Trying to fetch from R2: ${r2Key}`)
        const object = await readR2(env.R2_BUCKET, r2Key)
        
        if (object) {
          const extension = pathname.split('.').pop()?.toLowerCase() || ''
          const contentType = getContentType(extension)
          
          const headers = new Headers()
          headers.set('Content-Type', contentType)
          headers.set('Cache-Control', 'public, max-age=31536000, immutable')
          headers.set('ETag', object.etag)
          headers.set('X-Data-Source', 'r2-static')
          headers.set('X-Worker-Version', 'green-20250726')
          
          Object.entries(securityHeaders).forEach(([key, value]) => {
            headers.set(key, value)
          })
          
          return new Response(object.body, {
            status: 200,
            headers
          })
        }
      } catch (error) {
        console.error(`[Static File 20250726] Error fetching from R2:`, error)
        captureWorkerException(error, {
          tags: {
            runtime: 'cloudflare-worker',
            surface: 'api-gateway-green',
            endpoint_family: 'static-file',
            upstream_kind: 'r2-read',
            worker_version: 'green-20250726',
          },
        })
      }
      
      console.log(`[Static File 20250726] Not found in R2, proxying to Vercel: ${pathname}`)
      return proxyToVercel(request, env)
    }
    
    // その他のリクエストはVercelにプロキシ
    return proxyToVercel(request, env)
  }
}

export default Sentry.withSentry((env: Env) => createWorkerSentryOptions(env), handler)

// Content-Type推測用のヘルパー関数
function getContentType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'css': 'text/css',
    'js': 'application/javascript',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'otf': 'font/otf',
    'eot': 'application/vnd.ms-fontobject'
  }
  return mimeTypes[extension] || 'application/octet-stream'
}

// Vercelへのプロキシ関数（フォールバック用）
async function proxyToVercel(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const targetUrl = env.VERCEL_DEPLOYMENT_URL || 'https://nico-ranking-custom-yjsns-projects.vercel.app'
  
  const targetHost = new URL(targetUrl).hostname
  const proxyUrl = new URL(url.pathname + url.search, targetUrl)
  
  const headers = new Headers(request.headers)
  // Hostはfetchに任せる（明示するとリダイレクトループの原因になる）
  headers.set('X-Forwarded-Host', url.hostname)
  headers.set('X-Forwarded-Proto', 'https')
  headers.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '')
  // Worker の秘密は上流へ渡さない。現行の middleware は /api/* でこの値を使わず、
  // 2026-01 より前のビルドでは /api/admin/* の Basic 認証を飛ばす鍵として働いてしまう
  headers.delete('X-Worker-Auth')

  const proxyRequest = new Request(proxyUrl.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual'
  })
  
  try {
    const response = await fetch(proxyRequest)
    
    // 30xリダイレクトの処理（無限ループ防止）
    if (response.status === 307 || response.status === 301 || response.status === 302 || response.status === 303 || response.status === 308) {
      const location = response.headers.get('Location')
      console.warn(`[Green Worker] Redirect detected: ${response.status} to ${location ? sanitizeUrlForSentry(location) : 'none'}`)
      
      if (location) {
        const loc = new URL(location, url)
        // 追跡するのは上流デプロイ内のリダイレクトだけ。公開ホスト（自身に戻るループ）や
        // 他のホストへは、クライアントの Cookie / Authorization を付けて取りに行かずそのまま返す
        if (loc.hostname !== targetHost) {
          const origin = request.headers.get('Origin')
          const safeHeaders = new Headers(response.headers)
          Object.entries(securityHeaders).forEach(([key, value]) => safeHeaders.set(key, value))
          return applyCORSHeaders(new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: safeHeaders
          }), origin, {})
        }
        
        // ループを避けるため、Hostヘッダーを外した状態で追跡
        const followHeaders = new Headers(request.headers)
        followHeaders.delete('Host')
        followHeaders.set('X-Forwarded-Host', url.hostname)
        followHeaders.set('X-Forwarded-Proto', 'https')
        followHeaders.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '')
        const followed = await fetch(loc.toString(), {
          method: 'GET',
          headers: followHeaders,
          redirect: 'follow'
        })
        const origin = request.headers.get('Origin')
        const safeHeaders = new Headers(followed.headers)
        Object.entries(securityHeaders).forEach(([key, value]) => safeHeaders.set(key, value))
        return applyCORSHeaders(new Response(followed.body, {
          status: followed.status,
          statusText: followed.statusText,
          headers: safeHeaders
        }), origin, {})
      }
    }
    
    // 通常のレスポンス処理
    const responseHeaders = new Headers(response.headers)
    
    Object.entries(securityHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value)
    })
    
    // CORS headers will be applied at the end
    
    const normalProxyResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    })
    
    const origin = request.headers.get('Origin')
    return applyCORSHeaders(normalProxyResponse, origin, {})
  } catch (error) {
    console.error('Proxy error:', error)
    captureWorkerException(error, {
      tags: {
        runtime: 'cloudflare-worker',
        surface: 'api-gateway-green',
        endpoint_family: sanitizeUrlForSentry(request.url) || url.pathname,
        upstream_kind: 'vercel',
        worker_version: 'green-20250726',
      },
    })
    const proxyErrorResponse = new Response('Gateway Error', { 
      status: 502,
      headers: {
        'Content-Type': 'text/plain'
      }
    })
    
    const origin = request.headers.get('Origin')
    return applyCORSHeaders(proxyErrorResponse, origin, {})
  }
}
