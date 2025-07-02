/**
 * Cloudflare Worker - Smart Router v2 with Version-Based Routing
 * バージョンベースの柔軟なルーティング実装
 */

/// <reference types="@cloudflare/workers-types" />

interface Env {
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY: string
  R2_BUCKET: R2Bucket
  RANKING_DATA: KVNamespace
  MAINTENANCE_FLAGS: KVNamespace
  // Version-based Service Bindings
  WORKER_V1_STABLE?: Fetcher
  WORKER_V2_CANARY?: Fetcher
  WORKER_V2_STABLE?: Fetcher
  // Legacy bindings (後方互換性のため一時的に保持)
  WORKER_BLUE?: Fetcher
  WORKER_GREEN?: Fetcher
}

interface RoutingConfig {
  default: string
  canary_percentage?: number
  rules?: RoutingRule[]
  feature_flags?: Record<string, string>
}

interface RoutingRule {
  path?: string
  header?: string
  value?: string
  worker: string
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
      'Retry-After': '300',
      ...securityHeaders
    }
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    try {
      // メンテナンスモードチェック
      const [maintenanceMode, allowedIPs, routingConfigStr] = await Promise.all([
        env.MAINTENANCE_FLAGS.get("maintenance_mode"),
        env.MAINTENANCE_FLAGS.get("allowed_ips"),
        env.MAINTENANCE_FLAGS.get("routing_config")
      ]);
      
      // リクエスト情報をログ出力
      const xForwardedFor = request.headers.get('X-Forwarded-For');
      const cfConnectingIP = request.headers.get('CF-Connecting-IP') || '';
      const userAgent = request.headers.get('User-Agent') || '';
      
      console.log(`[Request] Path: ${url.pathname}, X-Forwarded-For: ${xForwardedFor}, CF-Connecting-IP: ${cfConnectingIP}, User-Agent: ${userAgent.substring(0, 50)}...`);
      
      // メンテナンスモード処理
      if (maintenanceMode === "true") {
        const workerAuthHeader = request.headers.get('X-Worker-Auth');
        const ssrHeader = request.headers.get('X-SSR-Request');
        const expectedAuthKey = env.WORKER_AUTH_KEY;
        
        if ((workerAuthHeader && expectedAuthKey && workerAuthHeader === expectedAuthKey) || ssrHeader === 'true') {
          console.log(`[Maintenance] Access allowed via Worker Auth or SSR`);
        } else {
          const clientIP = xForwardedFor 
            ? xForwardedFor.split(',')[0].trim()
            : cfConnectingIP;
          
          const allowedIPList = allowedIPs ? allowedIPs.split(',').map(ip => ip.trim()) : [];
          
          if (!allowedIPList.includes(clientIP)) {
            console.log(`[Maintenance] Access denied for IP: ${clientIP}`);
            return createMaintenanceResponse();
          }
        }
      }
      
      // ルーティング設定を解析
      let routingConfig: RoutingConfig = { default: "v1-stable" };
      
      if (routingConfigStr) {
        try {
          routingConfig = JSON.parse(routingConfigStr);
        } catch (e) {
          console.error('[Router] Failed to parse routing config:', e);
          // 後方互換性: 旧形式のactive_worker設定を確認
          const activeWorker = await env.MAINTENANCE_FLAGS.get("active_worker");
          if (activeWorker === "green") {
            routingConfig.default = "v1-stable"; // Green = 現在の安定版
          }
        }
      }
      
      // デバッグエンドポイント
      if (url.pathname === '/api/debug') {
        return new Response(JSON.stringify({
          time: new Date().toISOString(),
          worker: 'api-gateway-smart-router-v2',
          routing: routingConfig,
          maintenance: {
            mode: maintenanceMode || 'not_set',
            allowed_ips: allowedIPs || 'not_set'
          }
        }, null, 2), {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }
      
      // Workerを選択
      let targetWorker = routingConfig.default;
      
      // ルールベースのルーティング
      if (routingConfig.rules) {
        for (const rule of routingConfig.rules) {
          if (rule.path && url.pathname.startsWith(rule.path)) {
            targetWorker = rule.worker;
            break;
          }
          if (rule.header && request.headers.get(rule.header) === rule.value) {
            targetWorker = rule.worker;
            break;
          }
        }
      }
      
      // Canaryトラフィックの処理
      if (routingConfig.canary_percentage && routingConfig.canary_percentage > 0) {
        const threshold = routingConfig.canary_percentage / 100;
        if (Math.random() < threshold) {
          targetWorker = "v2-canary";
        }
      }
      
      console.log(`[Router] Selected worker: ${targetWorker}`);
      
      // /api/ パスをWorkerへルーティング
      if (url.pathname.startsWith('/api/')) {
        let response: Response | null = null;
        
        // Service Bindingを使用してWorkerを呼び出し
        switch (targetWorker) {
          case "v1-stable":
            if (env.WORKER_V1_STABLE) {
              response = await env.WORKER_V1_STABLE.fetch(request.clone());
            } else if (env.WORKER_GREEN) {
              // 後方互換性
              response = await env.WORKER_GREEN.fetch(request.clone());
            }
            break;
            
          case "v2-canary":
            if (env.WORKER_V2_CANARY) {
              response = await env.WORKER_V2_CANARY.fetch(request.clone());
            }
            break;
            
          case "v2-stable":
            if (env.WORKER_V2_STABLE) {
              response = await env.WORKER_V2_STABLE.fetch(request.clone());
            }
            break;
            
          default:
            // 後方互換性: blue/green形式
            if (targetWorker === "green" && env.WORKER_GREEN) {
              response = await env.WORKER_GREEN.fetch(request.clone());
            } else if (targetWorker === "blue" && env.WORKER_BLUE) {
              response = await env.WORKER_BLUE.fetch(request.clone());
            }
        }
        
        if (response) {
          const newResponse = new Response(response.body, response);
          newResponse.headers.set('X-Worker-Version', targetWorker);
          newResponse.headers.set('X-Routing-Decision', 'worker-selected');
          return newResponse;
        } else {
          console.error(`[Router] Worker ${targetWorker} not found`);
          return new Response('Service temporarily unavailable', { 
            status: 503,
            headers: {
              'Content-Type': 'text/plain',
              'Retry-After': '60'
            }
          });
        }
      }
      
      // その他のパスはVercelへプロキシ
      return proxyToVercel(request, env);
      
    } catch (error) {
      console.error('[Router] Error:', error instanceof Error ? error.stack : String(error));
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

// Vercelへのプロキシ関数
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
    
    const responseHeaders = new Headers(response.headers)
    
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