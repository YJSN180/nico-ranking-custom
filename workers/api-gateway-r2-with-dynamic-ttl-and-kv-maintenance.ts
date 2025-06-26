/**
 * Cloudflare Worker - API Gateway with R2 Integration, Dynamic TTL, ETag, and KV-based Maintenance Mode
 * 動的TTL、ETag対応、KVベースのメンテナンスモード統合版
 */

/// <reference types="@cloudflare/workers-types" />

interface Env {
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY: string
  R2_BUCKET: R2Bucket
  RANKING_DATA: KVNamespace
  MAINTENANCE_FLAGS: KVNamespace
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
 * 動的TTLを計算（インライン実装）
 */
function calculateDynamicTTL() {
  const now = new Date()
  const currentMinute = now.getMinutes()
  
  // 次の更新時刻を計算
  let nextUpdateMinute: number
  let hoursToAdd = 0
  
  if (currentMinute < 5) {
    nextUpdateMinute = 5
  } else if (currentMinute < 25) {
    nextUpdateMinute = 25
  } else {
    nextUpdateMinute = 5
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
  
  // TTL値を計算（最低60秒）
  const workersTTL = Math.max(60, secondsUntilUpdate)
  const cdnTTL = Math.max(60, secondsUntilUpdate - 60)
  const browserTTL = Math.max(60, secondsUntilUpdate - 120)
  
  // Cache-Controlヘッダーを生成
  const cacheControl = `public, max-age=${browserTTL}, s-maxage=${cdnTTL}, stale-while-revalidate=86400`
  const cdnCacheControl = `public, max-age=${cdnTTL}`
  
  return {
    cacheControl,
    cdnCacheControl
  }
}

/**
 * ETagが一致するかチェック（簡易版）
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

// メンテナンス画面のHTML生成
function createMaintenanceResponse(): Response {
  const html = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>メンテナンス中 | ニコラン(Re:turn)</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", "Yu Gothic", sans-serif;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          text-align: center;
          max-width: 500px;
          width: 100%;
        }
        h1 {
          color: #333;
          margin-bottom: 20px;
          font-size: 28px;
        }
        p {
          color: #666;
          line-height: 1.6;
          margin: 15px 0;
        }
        .logo {
          width: 100px;
          height: 100px;
          margin-bottom: 20px;
          filter: brightness(0) invert(0.4);
        }
        .progress {
          background: #e0e0e0;
          height: 4px;
          border-radius: 2px;
          margin: 30px 0;
          overflow: hidden;
        }
        .progress-bar {
          background: #5567d8;
          height: 100%;
          width: 30%;
          animation: progress 2s ease-in-out infinite;
        }
        @keyframes progress {
          0% { width: 0%; }
          50% { width: 70%; }
          100% { width: 100%; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='40' fill='none' stroke='%23333' stroke-width='4'/%3E%3Cpath d='M30 50 L45 65 L70 40' fill='none' stroke='%23333' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E" alt="ニコラン" class="logo">
        <h1>メンテナンス中</h1>
        <p>
          現在、システムメンテナンスを実施しております。<br>
          より良いサービスをご提供するため、しばらくお待ちください。
        </p>
        <div class="progress">
          <div class="progress-bar"></div>
        </div>
        <p><small>ご不便をおかけして申し訳ございません</small></p>
      </div>
    </body>
    </html>
  `;
  
  return new Response(html, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Retry-After': '300', // 5分後に再試行
      ...securityHeaders
    }
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // メンテナンスモードチェック
    try {
      const [maintenanceMode, allowedIPs] = await Promise.all([
        env.MAINTENANCE_FLAGS.get("maintenance_mode"),
        env.MAINTENANCE_FLAGS.get("allowed_ips")
      ]);
      
      if (maintenanceMode === "true") {
        const clientIP = request.headers.get('CF-Connecting-IP') || '';
        const allowedIPList = allowedIPs ? allowedIPs.split(',').map(ip => ip.trim()) : [];
        
        console.log(`[Maintenance] Mode: ON, Client IP: ${clientIP}, Allowed IPs: ${allowedIPList.join(', ')}`);
        console.log(`[Maintenance] Request path: ${url.pathname}`);
        
        // IPホワイトリストチェック
        if (!allowedIPList.includes(clientIP)) {
          console.log(`[Maintenance] Access denied for IP: ${clientIP}`);
          return createMaintenanceResponse();
        }
        
        console.log(`[Maintenance] Access allowed for IP: ${clientIP}, continuing to proxy`);
      }
    } catch (error) {
      console.error('Failed to check maintenance mode:', error);
      // フェイルオープン：エラー時は通常通り処理
    }
    
    // OPTIONS リクエストの処理
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request)
      })
    }
    
    // /api/metadata パスの処理（メタデータを返す）
    if (url.pathname === '/api/metadata' && env.R2_BUCKET) {
      try {
        const metadataObject = await env.R2_BUCKET.get('rankings/metadata.json')
        if (metadataObject) {
          const metadata = await metadataObject.text()
          const { cacheControl } = calculateDynamicTTL()
          
          return new Response(metadata, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': cacheControl,
              'ETag': metadataObject.httpEtag || `"${metadataObject.etag}"`,
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
    
    // /api/debug エンドポイント
    if (url.pathname === '/api/debug') {
      const debugInfo = {
        time: new Date().toISOString(),
        headers: Object.fromEntries(request.headers.entries()),
        worker: 'api-gateway-r2-with-dynamic-ttl-and-kv-maintenance',
        version: '2025-06-26-dynamic-ttl-kv-maintenance',
        maintenance: {
          kv_available: !!env.MAINTENANCE_FLAGS,
          client_ip: request.headers.get('CF-Connecting-IP') || 'unknown'
        }
      };
      
      // メンテナンスモードの状態も含める
      try {
        const maintenanceMode = await env.MAINTENANCE_FLAGS.get("maintenance_mode");
        const allowedIPs = await env.MAINTENANCE_FLAGS.get("allowed_ips");
        debugInfo.maintenance.mode = maintenanceMode || 'not_set';
        debugInfo.maintenance.mode_raw = maintenanceMode;
        debugInfo.maintenance.allowed_ips = allowedIPs || 'not_set';
      } catch (e) {
        debugInfo.maintenance.mode = 'error';
        debugInfo.maintenance.error = String(e);
      }
      
      return new Response(JSON.stringify(debugInfo, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(request)
        }
      })
    }
    
    // /api/ranking パスの処理
    if (url.pathname === '/api/ranking' && env.R2_BUCKET) {
      const genre = url.searchParams.get('genre') || 'all'
      const period = url.searchParams.get('period') || 'daily'
      const tag = url.searchParams.get('tag') || ''
      const page = parseInt(url.searchParams.get('page') || '1', 10)
      const limit = parseInt(url.searchParams.get('limit') || '100', 10)
      
      console.log(`[Worker] Request received - Genre: ${genre}, Period: ${period}, Tag: ${tag}, Page: ${page}`)
      
      let response: Response
      
      try {
        // R2からデータを取得
        const r2Key = tag 
          ? `rankings/${genre}/${period}/${encodeURIComponent(tag)}.json`
          : `rankings/${genre}/${period}/all.json`
        
        console.log(`[Worker] Fetching from R2: ${r2Key}`)
        const r2Object = await env.R2_BUCKET.get(r2Key)
        
        if (!r2Object) {
          // R2にデータがない場合
          if (tag) {
            // タグ別データが存在しない場合は空の結果を返す
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
                ...getCorsHeaders(request),
                ...securityHeaders
              }
            })
          } else {
            // 通常のランキングデータが存在しない場合はVercelにフォールバック
            console.log(`R2 miss for ${r2Key}, falling back to Vercel`)
            return proxyToVercel(request, env)
          }
        }
        
        // ETag取得
        const etag = r2Object.httpEtag || `"${r2Object.etag}"`
        
        // If-None-Matchチェック
        const ifNoneMatch = request.headers.get('If-None-Match')
        if (ifNoneMatch && isETagMatch(etag, ifNoneMatch)) {
          const { cacheControl, cdnCacheControl } = calculateDynamicTTL()
          return new Response(null, {
            status: 304,
            headers: {
              'ETag': etag,
              'Cache-Control': cacheControl,
              'CDN-Cache-Control': cdnCacheControl,
              ...getCorsHeaders(request),
              ...securityHeaders
            }
          })
        }
        
        // 動的TTLを計算
        const { cacheControl, cdnCacheControl } = calculateDynamicTTL()
        
        // R2から取得したデータを返す
        const headers = new Headers()
        headers.set('Content-Type', 'application/json')
        headers.set('Cache-Control', cacheControl)
        headers.set('CDN-Cache-Control', cdnCacheControl)
        headers.set('ETag', etag)
        headers.set('X-Data-Source', 'r2-direct')
        headers.set('X-Cache-Status', 'MISS')
        
        // CORSとセキュリティヘッダーを追加
        Object.entries(getCorsHeaders(request)).forEach(([key, value]) => {
          headers.set(key, value)
        })
        Object.entries(securityHeaders).forEach(([key, value]) => {
          headers.set(key, value)
        })
        
        // R2オブジェクトのメタデータから圧縮情報を取得
        const r2ContentEncoding = r2Object.httpMetadata?.contentEncoding
        if (r2ContentEncoding) {
          headers.set('Content-Encoding', r2ContentEncoding)
          headers.set('Vary', 'Accept-Encoding')
          // Cloudflareの変換を防ぐためno-transformを追加
          headers.set('Cache-Control', `${cacheControl}, no-transform`)
        }
        
        response = new Response(r2Object.body, {
          status: 200,
          headers,
          encodeBody: r2ContentEncoding ? "manual" : "auto"
        } as ResponseInit)
        
        console.log('[Worker] Successfully served from R2')
        
      } catch (error) {
        console.error('[Worker] Error fetching from R2:', error)
        return proxyToVercel(request, env)
      }
      
      // レスポンスにキャッシュ情報を追加
      response.headers.set('X-Cache-Status', 'MISS')
      response.headers.set('X-Data-Source', 'r2-direct')
      
      return response
    }
    
    // その他のリクエストはVercelへプロキシ
    return proxyToVercel(request, env)
  }
}

// Vercelへのプロキシ関数
async function proxyToVercel(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const targetUrl = env.VERCEL_DEPLOYMENT_URL || 'https://nico-ranking-custom-yjsns-projects.vercel.app'
  
  // URLからホスト名を抽出
  const targetHost = new URL(targetUrl).hostname
  
  // プロキシ用のURL構築
  const proxyUrl = new URL(url.pathname + url.search, targetUrl)
  
  // リクエストヘッダーの準備
  const headers = new Headers(request.headers)
  headers.set('Host', targetHost)
  headers.set('X-Forwarded-Host', 'nico-rank.com') // 明示的にnico-rank.comを設定
  headers.set('X-Forwarded-Proto', 'https')
  headers.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '')
  
  // 認証キーを追加
  if (env.WORKER_AUTH_KEY) {
    headers.set('X-Worker-Auth', env.WORKER_AUTH_KEY)
  }
  
  // Vercelへのリクエスト
  const proxyRequest = new Request(proxyUrl.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual' // manualに戻す
  })
  
  try {
    const response = await fetch(proxyRequest)
    
    console.log(`[Worker] Vercel response - Status: ${response.status}, URL: ${proxyUrl.toString()}`)
    
    // 3xxリダイレクトの場合の処理
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location')
      console.log(`[Worker] Redirect detected to: ${location}`)
      
      // nico-rank.comへのリダイレクトの場合、無限ループを防ぐ
      if (location && location.includes('nico-rank.com')) {
        console.log(`[Worker] Preventing redirect loop to nico-rank.com`)
        // リダイレクトを無視して、元のリクエストを再実行
        return new Response('Redirect loop prevented', { 
          status: 500,
          headers: {
            'Content-Type': 'text/plain',
            ...getCorsHeaders(request)
          }
        })
      }
    }
    
    // レスポンスヘッダーの処理
    const responseHeaders = new Headers(response.headers)
    
    // セキュリティヘッダーを追加
    Object.entries(securityHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value)
    })
    
    // CORSヘッダーを追加
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