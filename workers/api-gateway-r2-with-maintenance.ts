/**
 * Cloudflare Worker - API Gateway with R2 Integration + Maintenance Mode
 * R2から直接ランキングデータを配信（メンテナンスモード付き）
 */

/// <reference types="@cloudflare/workers-types" />

interface Env {
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY: string
  R2_BUCKET: R2Bucket
  RANKING_DATA?: KVNamespace
  ENVIRONMENT?: string
  PREVIEW_TOKEN?: string
  // メンテナンスモード用
  MAINTENANCE_MODE?: string
  ALLOWED_IPS?: string
  MAINTENANCE_TOKEN?: string
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

// CORSヘッダー定義
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
}

// メンテナンス画面のレスポンスを生成
function createMaintenanceResponse(): Response {
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>メンテナンス中 - ニコニコランキング</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background-color: #f5f5f5;
      color: #333;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      max-width: 500px;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
      color: #0066cc;
    }
    p {
      line-height: 1.6;
      color: #666;
    }
    .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔧</div>
    <h1>ただいまメンテナンス中です</h1>
    <p>より良いサービスをご提供するため、システムのメンテナンスを行っております。</p>
    <p>ご不便をおかけして申し訳ございませんが、しばらくお待ちください。</p>
    <p style="margin-top: 2rem; font-size: 0.9rem;">
      完了予定時刻: 未定
    </p>
  </div>
</body>
</html>`

  return new Response(html, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Retry-After': '300'
    }
  })
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // メンテナンスモードのチェック
    if (env.MAINTENANCE_MODE === 'true') {
      // クライアントIPを取得
      const clientIP = request.headers.get('CF-Connecting-IP') || ''
      
      // 許可IPリストを配列に変換
      const allowedIPs = env.ALLOWED_IPS ? env.ALLOWED_IPS.split(',').map(ip => ip.trim()) : []
      
      // メンテナンストークンをチェック
      const maintenanceToken = request.headers.get('X-Maintenance-Token')
      
      // アクセス判定
      const isAllowedIP = allowedIPs.includes(clientIP)
      const hasValidToken = env.MAINTENANCE_TOKEN && maintenanceToken === env.MAINTENANCE_TOKEN
      
      console.log(`[Maintenance Check] IP: ${clientIP}, Allowed: ${isAllowedIP}, Token: ${hasValidToken}`)
      
      // 許可されていない場合はメンテナンス画面
      if (!isAllowedIP && !hasValidToken) {
        return createMaintenanceResponse()
      }
    }
    
    // 以下、元のapi-gateway-r2.tsのロジック
    
    // プレビュー環境のアクセス制御
    if (env.ENVIRONMENT === 'preview' && env.PREVIEW_TOKEN) {
      const authHeader = request.headers.get('X-Preview-Token')
      if (authHeader !== env.PREVIEW_TOKEN) {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            ...securityHeaders,
            'WWW-Authenticate': 'Bearer realm="preview"'
          }
        })
      }
    }
    
    // OPTIONS リクエストの処理
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      })
    }
    
    // /api/metadata パスの処理（メタデータを返す）
    if (url.pathname === '/api/metadata' && env.R2_BUCKET) {
      try {
        const metadataObject = await env.R2_BUCKET.get('rankings/metadata.json')
        if (metadataObject) {
          const metadata = await metadataObject.text()
          return new Response(metadata, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300',
              ...corsHeaders,
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
          ...corsHeaders,
          ...securityHeaders
        }
      })
    }
    
    // /api/ranking パスでR2から読み込み
    if (url.pathname === '/api/ranking' && env.R2_BUCKET) {
      try {
        // クエリパラメータ取得
        const genre = url.searchParams.get('genre') || 'all'
        const period = url.searchParams.get('period') || '24h'
        const tag = url.searchParams.get('tag')
        
        // R2キー生成
        let r2Key: string
        let cacheKeySuffix: string
        
        if (tag) {
          // タグランキングの場合
          const encodedTag = encodeURIComponent(tag)
          r2Key = `rankings/${genre}/${period}/tags/${encodedTag}.json`
          cacheKeySuffix = `${genre}/${period}/tags/${encodedTag}`
        } else {
          // 通常ランキングの場合
          r2Key = `rankings/${genre}/${period}/all.json`
          cacheKeySuffix = `${genre}/${period}/all`
        }
        
        // Workers Cacheキー
        const cacheKey = new Request(`https://r2-cache.nico-rank.com/ranking/${cacheKeySuffix}`, request)
        const cache = caches.default
        
        // キャッシュチェック
        let response = await cache.match(cacheKey)
        if (response) {
          // キャッシュヒット
          response = new Response(response.body, response)
          response.headers.set('X-Cache-Status', 'HIT')
          return response
        }
        
        // R2から取得
        console.log(`[Worker] Attempting to read from R2: ${r2Key}`)
        const r2Object = await env.R2_BUCKET.get(r2Key)
        
        if (!r2Object) {
          // タグデータが存在しない場合
          if (tag) {
            console.log(`[Worker] Tag data not found for ${r2Key}, returning empty result`)
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
                ...corsHeaders,
                ...securityHeaders
              }
            })
          } else {
            // 通常ランキングが存在しない場合、Vercelへフォールバック
            console.log(`R2 miss for ${r2Key}, falling back to Vercel`)
            return proxyToVercel(request, env)
          }
        }
        
        // R2オブジェクトのメタデータから圧縮情報を取得
        const r2ContentEncoding = r2Object.httpMetadata?.contentEncoding
        const r2ContentType = r2Object.httpMetadata?.contentType
        console.log(`[Worker] R2 object metadata - encoding: ${r2ContentEncoding}, type: ${r2ContentType}`)
        
        // ストリームを分割して最初のチャンクを検査
        const [inspectStream, passthroughStream] = r2Object.body!.tee()
        
        const reader = inspectStream.getReader()
        const { value: firstChunk, done } = await reader.read()
        reader.releaseLock()
        
        // gzipマジックナンバーチェック (0x1f, 0x8b)
        const isGzipped = !done && firstChunk && firstChunk.length >= 2 && 
                         firstChunk[0] === 0x1f && firstChunk[1] === 0x8b
        
        console.log(`[Worker] Data is ${isGzipped ? 'gzipped' : 'not gzipped'}`)
        
        // レスポンスヘッダー作成
        const headers = new Headers()
        headers.set('Content-Type', 'application/json')
        headers.set('Cache-Control', 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400, no-transform')
        headers.set('CDN-Cache-Control', 'public, max-age=3600')
        headers.set('X-Data-Source', 'r2-direct')
        headers.set('X-Cache-Status', 'MISS')
        
        // CORSとセキュリティヘッダーを追加
        Object.entries(corsHeaders).forEach(([key, value]) => {
          headers.set(key, value)
        })
        Object.entries(securityHeaders).forEach(([key, value]) => {
          headers.set(key, value)
        })
        
        // R2のメタデータにContent-Encodingがある場合は優先
        if (r2ContentEncoding) {
          headers.set('Content-Encoding', r2ContentEncoding)
          headers.set('Vary', 'Accept-Encoding')
        }
        
        if (isGzipped) {
          console.log(`[Worker] Serving pre-compressed gzipped data`)
          
          // 重要: encodeBody: "manual" を使用してCloudflareの自動圧縮を無効化
          headers.set('Content-Encoding', 'gzip')
          headers.set('Vary', 'Accept-Encoding')
          
          response = new Response(passthroughStream, {
            status: 200,
            headers,
            encodeBody: "manual"
          } as ResponseInit)
        } else {
          // 非圧縮データの場合はそのまま返す（Cloudflareが自動圧縮する）
          response = new Response(passthroughStream, {
            status: 200,
            headers
          })
        }
        
        // キャッシュに保存
        ctx.waitUntil(cache.put(cacheKey, response.clone()))
        
        return response
        
      } catch (error) {
        console.error('R2 read error:', error)
        // エラー時はVercelへフォールバック
        return proxyToVercel(request, env)
      }
    }
    
    // その他のリクエストはVercelへプロキシ
    return proxyToVercel(request, env)
  }
}

// Vercelへのプロキシ関数
async function proxyToVercel(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const targetUrl = env.VERCEL_DEPLOYMENT_URL || 'https://nico-ranking-7b010d3zi-yjsns-projects.vercel.app'
  
  console.log(`[Proxy] Proxying ${url.pathname} to ${targetUrl}`)
  
  // ターゲットURLのホスト名取得
  const targetHost = new URL(targetUrl).hostname
  
  // プロキシURL構築
  const proxyUrl = new URL(url.pathname + url.search, targetUrl)
  
  // ヘッダー設定
  const headers = new Headers(request.headers)
  headers.set('Host', targetHost)
  headers.set('X-Forwarded-Host', url.hostname)
  headers.set('X-Forwarded-Proto', 'https')
  headers.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '')
  
  if (env.WORKER_AUTH_KEY) {
    headers.set('X-Worker-Auth', env.WORKER_AUTH_KEY)
  }
  
  // Vercelへリクエスト
  const proxyRequest = new Request(proxyUrl.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual'
  })
  
  try {
    const response = await fetch(proxyRequest)
    
    // Handle redirects manually to prevent loops
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location')
      if (location) {
        // If the redirect is to the same domain, prevent loop
        const locationUrl = new URL(location, url.origin)
        if (locationUrl.hostname === url.hostname) {
          console.warn(`Redirect loop detected: ${url.toString()} -> ${location}`)
          // Continue with normal processing instead of following redirect
        } else {
          // For external redirects, pass them through
          const responseHeaders = new Headers(response.headers)
          Object.entries(securityHeaders).forEach(([key, value]) => {
            responseHeaders.set(key, value)
          })
          Object.entries(corsHeaders).forEach(([key, value]) => {
            responseHeaders.set(key, value)
          })
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
          })
        }
      }
    }
    
    // レスポンスヘッダー
    const responseHeaders = new Headers(response.headers)
    
    // セキュリティヘッダー追加
    Object.entries(securityHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value)
    })
    
    // CORSヘッダー追加
    Object.entries(corsHeaders).forEach(([key, value]) => {
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
        ...corsHeaders
      }
    })
  }
}