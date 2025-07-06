/**
 * Cloudflare Worker - Green Worker 20250705 with Dynamic TTL & ETag Support
 * Smart Router用Green Worker（動的TTL & ETag対応、2025-07-05版）
 * 
 * Features:
 * - Dynamic TTL based on actual update schedule (0, 20, 40 minutes)
 * - ETag support for conditional requests
 * - R2 direct access with HTML entity decoding
 * - Smart Router Green Worker deployment
 * 
 * 実装状況 (2025-07-06更新):
 * ✅ /api/ranking - R2からランキングデータ取得（動的TTL対応）
 * ✅ /api/metadata - メタデータ取得
 * ✅ /api/debug - デバッグ情報
 * ✅ /api/thumbnail/{videoId} - サムネイル取得API (KVキャッシュなし、CDNキャッシュのみ)
 * 
 * 注意事項:
 * - サムネイルAPIはKVキャッシュを使用しない（個人差でキャッシュヒット率が低いため）
 * - CDNレベルでキャッシュ: ブラウザ1時間、CDN24時間
 */

/// <reference types="@cloudflare/workers-types" />

import { decodeRankingData } from './utils/html-decode'

interface Env {
  R2_BUCKET: R2Bucket
  RANKING_DATA: KVNamespace
  MAINTENANCE_FLAGS: KVNamespace
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY?: string
}

// セキュリティヘッダー定義
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; media-src 'self' https:; object-src 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-DNS-Prefetch-Control': 'on'
}

// 動的CORSヘッダー生成
function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin')
  const allowedOrigins = [
    'http://localhost:3000',
    'https://nico-rank.com',
    'https://nico-ranking-custom-yjsns-projects.vercel.app'
  ]
  
  // Vercelプレビューデプロイメントのパターン
  const vercelPreviewPattern = /^https:\/\/nico-ranking-[a-z0-9-]+\.vercel\.app$/
  
  let allowOrigin = '*' // デフォルト（公開API向け）
  
  if (origin && (allowedOrigins.includes(origin) || vercelPreviewPattern.test(origin))) {
    allowOrigin = origin
  }
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Max-Age': '86400'
  }
}

/**
 * 動的TTL計算 20250705
 * 実際の更新スケジュール（毎時0,20,40分）に最適化
 * GitHub Actions cron: every 20 minutes (0,20,40)
 */
function calculateDynamicTTL() {
  const now = new Date()
  const currentMinute = now.getMinutes()
  
  // 次の更新時刻を計算（毎時0,20,40分）
  let nextUpdateMinute: number
  let hoursToAdd = 0
  
  if (currentMinute < 20) {
    // 0-19分：次は20分
    nextUpdateMinute = 20
  } else if (currentMinute < 40) {
    // 20-39分：次は40分  
    nextUpdateMinute = 40
  } else {
    // 40-59分：次は翌時の0分
    nextUpdateMinute = 0
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
  
  // 20250705 TTL戦略：負荷分散と鮮度のバランス
  // Browser: 5分（ユーザーセッション内重複回避）
  // CDN: 10分（地域キャッシュ効率化）  
  // Worker: 動的（更新直前は短く、直後は長く）
  
  const browserTTL = 300  // 5分固定
  const cdnTTL = 600      // 10分固定  
  const workerTTL = Math.min(secondsUntilUpdate - 60, 1080) // 更新1分前まで、最大18分
  
  // 安全な最小値を設定
  const safeCdnTTL = Math.max(cdnTTL, 300)  // 最低5分
  const safeWorkerTTL = Math.max(workerTTL, 180) // 最低3分
  
  // Cache-Controlヘッダーを生成
  // stale-while-revalidate: 15分（適度な猶予）
  // stale-if-error: 1時間（障害時の可用性確保）
  const cacheControl = `public, max-age=${browserTTL}, s-maxage=${safeCdnTTL}, stale-while-revalidate=900, stale-if-error=3600`
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
      safeWorkerTTL: safeWorkerTTL
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // OPTIONS リクエストの処理
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request)
      })
    }
    
    // /api/debug エンドポイント
    if (url.pathname === '/api/debug') {
      const { debugInfo, secondsUntilUpdate } = calculateDynamicTTL()
      
      const debugOutput = {
        time: new Date().toISOString(),
        headers: Object.fromEntries(request.headers.entries()),
        worker: 'api-gateway-green-20250705',
        version: 'green-20250705-dynamic-ttl',
        features: ['dynamic-ttl', 'etag-support', 'html-decode', 'smart-router-compatible'],
        dynamicTTL: {
          ...debugInfo,
          secondsUntilUpdate,
          nextUpdateTime: new Date(Date.now() + secondsUntilUpdate * 1000).toISOString()
        }
      };
      
      return new Response(JSON.stringify(debugOutput, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(request)
        }
      })
    }
    
    // /api/metadata パスの処理
    if (url.pathname === '/api/metadata' && env.R2_BUCKET) {
      try {
        const metadataObject = await env.R2_BUCKET.get('rankings/metadata.json')
        if (metadataObject) {
          const { cacheControl } = calculateDynamicTTL()
          
          // gzip圧縮チェック
          const contentEncoding = metadataObject.httpMetadata?.contentEncoding
          let metadataText: string
          
          if (contentEncoding === 'gzip') {
            console.log('[Green Worker 20250705] Metadata is gzipped, decompressing...')
            try {
              const compressedData = await metadataObject.arrayBuffer()
              metadataText = await new Response(
                new Blob([compressedData]).stream().pipeThrough(new DecompressionStream('gzip'))
              ).text()
            } catch (decompressError) {
              console.error('[Green Worker 20250705] Failed to decompress metadata:', decompressError)
              metadataText = await metadataObject.text()
            }
          } else {
            metadataText = await metadataObject.text()
          }
          
          return new Response(metadataText, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': cacheControl,
              'ETag': metadataObject.httpEtag || `"${metadataObject.etag}"`,
              'X-Worker-Version': 'green-20250705',
              ...getCorsHeaders(request),
              ...securityHeaders
            }
          })
        }
      } catch (error) {
        console.error('Metadata read error:', error)
      }
      return new Response('{}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(request),
          ...securityHeaders
        }
      })
    }
    
    // /api/ranking パスの処理
    if (url.pathname === '/api/ranking' && env.R2_BUCKET) {
      const genre = url.searchParams.get('genre') || 'all'
      const period = url.searchParams.get('period') || '24h'
      const tag = url.searchParams.get('tag') || ''
      
      console.log(`[Worker v2.0] Request received - Genre: ${genre}, Period: ${period}, Tag: ${tag}`)
      
      try {
        // R2からデータを取得
        const r2Key = tag 
          ? `rankings/${genre}/${period}/tags/${encodeURIComponent(tag)}.json`
          : `rankings/${genre}/${period}/all.json`
        
        console.log(`[Worker v2.0] Fetching from R2: ${r2Key}`)
        const r2Object = await env.R2_BUCKET.get(r2Key)
        
        if (!r2Object) {
          if (tag) {
            // タグ別データが存在しない場合は空の結果を返す
            console.log(`[Worker v2.0] Tag data not found for ${r2Key}, returning empty result`)
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
            return new Response(JSON.stringify(emptyResponse), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'X-Data-Source': 'r2-tag-not-found',
                'X-Worker-Version': 'green-20250705',
                ...getCorsHeaders(request),
                ...securityHeaders
              }
            })
          } else {
            // 通常のランキングデータが存在しない場合は404を返す
            console.log(`[Worker v2.0] R2 miss for ${r2Key}, returning 404`)
            return new Response(JSON.stringify({
              error: 'Ranking data not found',
              message: `No data available for ${genre}/${period}`
            }), {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'X-Data-Source': 'r2-not-found',
                'X-Worker-Version': 'green-20250705',
                ...getCorsHeaders(request),
                ...securityHeaders
              }
            })
          }
        }
        
        // ETag取得
        const etag = r2Object.httpEtag || `"${r2Object.etag}"`
        
        // If-None-Matchチェック
        const ifNoneMatch = request.headers.get('If-None-Match')
        if (ifNoneMatch && isETagMatch(etag, ifNoneMatch)) {
          const { cacheControl, cdnCacheControl, workerTTL, secondsUntilUpdate } = calculateDynamicTTL()
          return new Response(null, {
            status: 304,
            headers: {
              'ETag': etag,
              'Cache-Control': cacheControl,
              'CDN-Cache-Control': cdnCacheControl,
              'CF-Cache-Status': 'REVALIDATED',
              'Server-Timing': `cfCache;desc="REVALIDATED", workerTTL;dur=${workerTTL}, nextUpdate;dur=${secondsUntilUpdate}`,
              'X-Worker-Version': 'green-20250705',
              'X-TTL-Source': 'dynamic-20250705',
              ...getCorsHeaders(request),
              ...securityHeaders
            }
          })
        }
        
        // 動的TTL v2.0を計算
        const { cacheControl, cdnCacheControl, workerTTL, secondsUntilUpdate } = calculateDynamicTTL()
        
        // R2から取得したデータを返す
        const headers = new Headers()
        headers.set('Content-Type', 'application/json')
        headers.set('Cache-Control', cacheControl)
        headers.set('CDN-Cache-Control', cdnCacheControl)
        headers.set('ETag', etag)
        headers.set('X-Data-Source', 'r2-direct')
        headers.set('X-Cache-Status', 'MISS')
        headers.set('CF-Cache-Status', 'MISS')
        headers.set('X-Worker-Version', 'green-20250705')
        headers.set('X-TTL-Source', 'dynamic-20250705')
        headers.set('Server-Timing', `cfCache;desc="MISS", workerTTL;dur=${workerTTL}, nextUpdate;dur=${secondsUntilUpdate}`)
        
        // CORSとセキュリティヘッダーを追加
        Object.entries(getCorsHeaders(request)).forEach(([key, value]) => {
          headers.set(key, value)
        })
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
              
              return new Response(JSON.stringify(decodedData), {
                status: 200,
                headers
              })
            } catch (parseError) {
              console.error('[Green Worker 20250705] Failed to parse or decode JSON:', parseError)
              return new Response(decompressedData, {
                status: 200,
                headers
              })
            }
          } catch (decompressError) {
            console.error('[Green Worker 20250705] Failed to decompress gzipped data:', decompressError)
            return new Response(workStream, {
              status: 200,
              headers,
              encodeBody: "manual"
            } as ResponseInit)
          }
        } else {
          // 非圧縮データの場合
          console.log(`[Worker v2.0] Data is not gzipped, decoding HTML entities`)
          
          try {
            const textData = await new Response(passthroughStream).text()
            const jsonData = JSON.parse(textData)
            const decodedData = decodeRankingData(jsonData)
            
            return new Response(JSON.stringify(decodedData), {
              status: 200,
              headers
            })
          } catch (error) {
            console.error('[Green Worker 20250705] Failed to parse or decode JSON:', error)
            return new Response(workStream, {
              status: 200,
              headers
            })
          }
        }
        
      } catch (error) {
        console.error('[Green Worker 20250705] Error fetching from R2:', error)
        return new Response(JSON.stringify({
          error: 'Internal server error',
          message: 'Failed to fetch ranking data'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'X-Worker-Version': 'green-20250705',
            ...getCorsHeaders(request),
            ...securityHeaders
          }
        })
      }
    }
    
    // /api/thumbnail/{videoId} パスの処理
    if (url.pathname.startsWith('/api/thumbnail/')) {
      try {
        const videoId = url.pathname.split('/').pop()
        
        if (!videoId || !/^[a-zA-Z0-9_-]+$/.test(videoId)) {
          return new Response(JSON.stringify({ error: 'Invalid video ID' }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(request),
              ...securityHeaders
            }
          })
        }
        
        // ニコニコ動画から動画ページを取得（キャッシュなし）
        const nicoResponse = await fetch(`https://www.nicovideo.jp/watch/${videoId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        })
        
        if (!nicoResponse.ok) {
          return new Response(JSON.stringify({ error: 'Video not found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(request),
              ...securityHeaders
            }
          })
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
          }
        }
        
        console.log('Final thumbnail URL:', thumbnailUrl)
        
        const result = JSON.stringify({ 
          videoId,
          thumbnail: thumbnailUrl
        })
        
        return new Response(result, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            // CDNレベルでのキャッシュのみ（個人差があるためKVキャッシュは使用しない）
            'Cache-Control': 'public, max-age=3600, s-maxage=86400', // ブラウザ1時間、CDN24時間
            'X-Worker-Version': 'green-20250705',
            ...getCorsHeaders(request),
            ...securityHeaders
          }
        })
        
      } catch (error) {
        console.error('Error fetching thumbnail:', error)
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(request),
            ...securityHeaders
          }
        })
      }
    }
    
    // 静的ファイルのリクエストをチェック（先にR2から試す）
    const pathname = url.pathname
    const staticFiles = ['/icon.png', '/icon-192.png', '/icon-512.png', '/og-image.png', '/manifest.json', '/robots.txt'];
    const isStaticFile = staticFiles.includes(pathname) || pathname.startsWith('/fonts/') || /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf|eot)$/i.test(pathname)
    
    if (isStaticFile) {
      try {
        const r2Key = pathname.startsWith('/') ? `static${pathname}` : `static/${pathname}`
        console.log(`[Static File 20250705] Trying to fetch from R2: ${r2Key}`)
        const object = await env.R2_BUCKET.get(r2Key)
        
        if (object) {
          const extension = pathname.split('.').pop()?.toLowerCase() || ''
          const contentType = getContentType(extension)
          
          const headers = new Headers()
          headers.set('Content-Type', contentType)
          headers.set('Cache-Control', 'public, max-age=31536000, immutable')
          headers.set('ETag', object.etag)
          headers.set('X-Data-Source', 'r2-static')
          headers.set('X-Worker-Version', 'green-20250705')
          
          Object.entries(securityHeaders).forEach(([key, value]) => {
            headers.set(key, value)
          })
          
          return new Response(object.body, {
            status: 200,
            headers
          })
        }
      } catch (error) {
        console.error(`[Static File 20250705] Error fetching from R2:`, error)
      }
      
      console.log(`[Static File 20250705] Not found in R2, proxying to Vercel: ${pathname}`)
      return proxyToVercel(request, env)
    }
    
    // その他のリクエストはVercelにプロキシ
    return proxyToVercel(request, env)
  }
}

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
  headers.set('Host', targetHost)
  headers.set('X-Forwarded-Host', url.hostname)
  headers.set('X-Forwarded-Proto', 'https')
  headers.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '')
  
  if (env.WORKER_AUTH_KEY) {
    headers.set('X-Worker-Auth', env.WORKER_AUTH_KEY)
  }
  
  const proxyRequest = new Request(proxyUrl.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual'
  })
  
  try {
    const response = await fetch(proxyRequest)
    
    // 307リダイレクトの処理（無限ループ防止）
    if (response.status === 307 || response.status === 301 || response.status === 302 || response.status === 303 || response.status === 308) {
      const location = response.headers.get('Location')
      console.warn(`[Green Worker] Redirect detected: ${response.status} to ${location}`)
      
      // リダイレクト先がnico-rank.comの場合は無視して200を返す
      if (location && (location.includes('nico-rank.com') || location.includes('nico-ranking-custom'))) {
        console.warn('[Green Worker] Preventing redirect loop, returning 200 instead')
        // リダイレクトを無視してVercelからコンテンツを取得
        const finalResponse = await fetch(location || proxyUrl.toString(), {
          method: 'GET',
          headers: headers,
          redirect: 'follow'
        })
        
        const finalHeaders = new Headers(finalResponse.headers)
        Object.entries(securityHeaders).forEach(([key, value]) => {
          finalHeaders.set(key, value)
        })
        Object.entries(getCorsHeaders(request)).forEach(([key, value]) => {
          finalHeaders.set(key, value)
        })
        
        return new Response(finalResponse.body, {
          status: 200,
          statusText: 'OK',
          headers: finalHeaders
        })
      }
    }
    
    // 通常のレスポンス処理
    const responseHeaders = new Headers(response.headers)
    
    Object.entries(securityHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value)
    })
    
    Object.entries(getCorsHeaders(request)).forEach(([key, value]) => {
      responseHeaders.set(key, value)
    })
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    })
  } catch (error) {
    console.error('Proxy error:', error)
    return new Response('Gateway Error', { 
      status: 502,
      headers: {
        'Content-Type': 'text/plain',
        ...getCorsHeaders(request)
      }
    })
  }
}