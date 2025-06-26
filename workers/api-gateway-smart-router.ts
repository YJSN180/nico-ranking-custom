/**
 * Cloudflare Worker - Smart Router with Blue-Green Deployment
 * KVベースでアクティブなWorkerバージョンを動的に制御
 */

/// <reference types="@cloudflare/workers-types" />

interface Env {
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY: string
  R2_BUCKET: R2Bucket
  RANKING_DATA: KVNamespace
  MAINTENANCE_FLAGS: KVNamespace
  // Worker版本切り替え用のService Bindings
  WORKER_BLUE?: Fetcher // 現行版Worker (api-gateway-r2)
  WORKER_GREEN?: Fetcher // 新版Worker (api-gateway-r2-with-dynamic-ttl)
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
    
    try {
      // メンテナンスモードチェック
      const [maintenanceMode, allowedIPs, activeWorker] = await Promise.all([
        env.MAINTENANCE_FLAGS.get("maintenance_mode"),
        env.MAINTENANCE_FLAGS.get("allowed_ips"),
        env.MAINTENANCE_FLAGS.get("active_worker") // "blue" or "green"
      ]);
      
      // メンテナンスモード処理
      if (maintenanceMode === "true") {
        // IPの取得優先順位：X-Forwarded-For（Vercel経由） > CF-Connecting-IP（直接アクセス）
        const xForwardedFor = request.headers.get('X-Forwarded-For');
        const cfConnectingIP = request.headers.get('CF-Connecting-IP') || '';
        
        // X-Forwarded-Forの最初のIPを取得（複数のプロキシ経由の場合）
        const clientIP = xForwardedFor 
          ? xForwardedFor.split(',')[0].trim()
          : cfConnectingIP;
        
        const allowedIPList = allowedIPs ? allowedIPs.split(',').map(ip => ip.trim()) : [];
        
        console.log(`[Maintenance] Mode: ON, Client IP: ${clientIP}, X-Forwarded-For: ${xForwardedFor}, CF-Connecting-IP: ${cfConnectingIP}, Allowed IPs: ${allowedIPList.join(', ')}`);
        
        // IPホワイトリストチェック
        if (!allowedIPList.includes(clientIP)) {
          console.log(`[Maintenance] Access denied for IP: ${clientIP}`);
          return createMaintenanceResponse();
        }
        
        console.log(`[Maintenance] Access allowed for IP: ${clientIP}`);
      }
      
      // アクティブなWorkerを決定（デフォルトは "blue"）
      const targetWorker = activeWorker === "green" ? "green" : "blue";
      console.log(`[Router] Active worker: ${targetWorker}`);
      
      // デバッグエンドポイント
      if (url.pathname === '/api/debug') {
        const xForwardedFor = request.headers.get('X-Forwarded-For');
        const cfConnectingIP = request.headers.get('CF-Connecting-IP') || '';
        const clientIP = xForwardedFor 
          ? xForwardedFor.split(',')[0].trim()
          : cfConnectingIP;
          
        return new Response(JSON.stringify({
          time: new Date().toISOString(),
          worker: 'api-gateway-smart-router',
          activeWorker: targetWorker,
          maintenance: {
            mode: maintenanceMode || 'not_set',
            client_ip: clientIP || 'unknown',
            cf_connecting_ip: cfConnectingIP || 'unknown',
            x_forwarded_for: xForwardedFor || 'not_set',
            allowed_ips: allowedIPs || 'not_set'
          }
        }, null, 2), {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }
      
      // 選択されたWorkerへリクエストをルーティング
      if (targetWorker === "green" && env.WORKER_GREEN) {
        // 新版Worker（動的TTL対応）へルーティング
        const response = await env.WORKER_GREEN.fetch(request.clone());
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('X-Worker-Version', 'green-dynamic-ttl');
        return newResponse;
      } else if (env.WORKER_BLUE) {
        // 現行版Workerへルーティング
        const response = await env.WORKER_BLUE.fetch(request.clone());
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('X-Worker-Version', 'blue-stable');
        return newResponse;
      } else {
        // Service Bindingが設定されていない場合、エラーを返す（循環参照を防止）
        console.error('[Router] No service bindings configured');
        return new Response('Service temporarily unavailable', { 
          status: 503,
          headers: {
            'Content-Type': 'text/plain',
            'Retry-After': '60'
          }
        });
      }
      
    } catch (error) {
      console.error('[Router] Error:', error);
      // エラー時は503を返す（循環参照を防止）
      return new Response('Service temporarily unavailable', { 
        status: 503,
        headers: {
          'Content-Type': 'text/plain',
          'Retry-After': '60'
        }
      });
    }
  }
}

// Vercelへのプロキシ関数（フォールバック用）
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
        'Content-Type': 'text/plain'
      }
    })
  }
}