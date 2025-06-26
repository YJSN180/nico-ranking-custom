/**
 * Cloudflare Worker - API Gateway with R2 Integration and KV-based Maintenance Mode
 * R2から直接ランキングデータを配信 + KVベースのメンテナンスモード
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

// CORSヘッダー定義
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
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
        
        // IPホワイトリストチェック
        if (!allowedIPList.includes(clientIP)) {
          console.log(`[Maintenance] Access denied for IP: ${clientIP}`);
          return createMaintenanceResponse();
        }
        
        console.log(`[Maintenance] Access allowed for IP: ${clientIP}`);
      }
    } catch (error) {
      console.error('Failed to check maintenance mode:', error);
      // フェイルオープン：エラー時は通常通り処理
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
    
    // /api/debug エンドポイント
    if (url.pathname === '/api/debug') {
      const debugInfo = {
        time: new Date().toISOString(),
        headers: Object.fromEntries(request.headers.entries()),
        worker: 'api-gateway-r2-with-kv-maintenance',
        version: '2025-06-26-kv-maintenance',
        maintenance: {
          kv_available: !!env.MAINTENANCE_FLAGS,
          client_ip: request.headers.get('CF-Connecting-IP') || 'unknown'
        }
      };
      
      // メンテナンスモードの状態も含める
      try {
        const maintenanceMode = await env.MAINTENANCE_FLAGS.get("maintenance_mode");
        debugInfo.maintenance.mode = maintenanceMode || 'not_set';
      } catch (e) {
        debugInfo.maintenance.mode = 'error';
      }
      
      return new Response(JSON.stringify(debugInfo, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
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
                ...corsHeaders,
                ...securityHeaders
              }
            })
          } else {
            // 通常のランキングデータが存在しない場合はVercelにフォールバック
            console.log(`R2 miss for ${r2Key}, falling back to Vercel`)
            return proxyToVercel(request, env)
          }
        }
        
        // R2から取得したデータを返す
        const headers = new Headers()
        headers.set('Content-Type', 'application/json')
        headers.set('Cache-Control', 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400')
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
        
        // R2オブジェクトのメタデータから圧縮情報を取得
        const r2ContentEncoding = r2Object.httpMetadata?.contentEncoding
        if (r2ContentEncoding) {
          headers.set('Content-Encoding', r2ContentEncoding)
          headers.set('Vary', 'Accept-Encoding')
          headers.set('Cache-Control', 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400, no-transform')
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
  headers.set('X-Forwarded-Host', url.hostname)
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
    redirect: 'manual'
  })
  
  try {
    const response = await fetch(proxyRequest)
    
    // レスポンスヘッダーの処理
    const responseHeaders = new Headers(response.headers)
    
    // セキュリティヘッダーを追加
    Object.entries(securityHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value)
    })
    
    // CORSヘッダーを追加
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