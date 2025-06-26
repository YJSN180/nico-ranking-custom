/**
 * Cloudflare Worker - Maintenance Gate
 * 本番環境で特定のIPまたはトークンを持つユーザーのみ新Workerをテスト
 */

interface Env {
  // 現行の本番Worker URL
  CURRENT_WORKER_URL: string
  // テスト中の新Worker URL  
  NEW_WORKER_URL: string
  // 許可されたIPリスト（カンマ区切り）
  ALLOWED_IPS?: string
  // プレビュートークン
  PREVIEW_TOKEN?: string
  // メンテナンスモード（true: 全員メンテナンス画面, false: IP/トークンでゲート）
  MAINTENANCE_MODE?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    
    // クライアントIPを取得
    const clientIP = request.headers.get('CF-Connecting-IP') || ''
    
    // 許可IPリストを配列に変換
    const allowedIPs = env.ALLOWED_IPS ? env.ALLOWED_IPS.split(',').map(ip => ip.trim()) : []
    
    // プレビュートークンをチェック
    const previewToken = request.headers.get('X-Preview-Token')
    
    // アクセス判定
    const isAllowedIP = allowedIPs.includes(clientIP)
    const hasValidToken = env.PREVIEW_TOKEN && previewToken === env.PREVIEW_TOKEN
    const isAllowed = isAllowedIP || hasValidToken
    
    // メンテナンスモードの場合
    if (env.MAINTENANCE_MODE === 'true') {
      if (!isAllowed) {
        return createMaintenanceResponse()
      }
    }
    
    // 許可されたユーザーは通常のサイトへアクセス
    if (isAllowed) {
      // APIリクエストは現行Workerへ
      if (url.pathname.startsWith('/api/')) {
        console.log(`Routing API request to current worker for IP: ${clientIP}`)
        
        // 現行WorkerへのプロキシURL構築
        const targetUrl = new URL(url.pathname + url.search, env.CURRENT_WORKER_URL)
      
      // ヘッダー設定
      const headers = new Headers(request.headers)
      headers.set('X-Forwarded-For', clientIP)
      headers.set('X-Real-IP', clientIP)
      
      // 現行Workerへリクエスト
      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'follow' // リダイレクトを自動的に追従
      })
      
      // レスポンスヘッダーに識別情報を追加
      const responseHeaders = new Headers(response.headers)
      responseHeaders.set('X-Worker-Version', 'current')
      responseHeaders.set('X-Routed-By', 'maintenance-gate')
      
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        })
      } else {
        // フロントエンドリクエストはVercelへ
        console.log(`Routing frontend request to Vercel for IP: ${clientIP}`)
        
        const vercelUrl = env.VERCEL_DEPLOYMENT_URL || 'https://nico-ranking-custom-yjsns-projects.vercel.app'
        const targetUrl = new URL(url.pathname + url.search, vercelUrl)
        
        // ヘッダー設定
        const headers = new Headers(request.headers)
        headers.set('Host', new URL(vercelUrl).hostname)
        headers.set('X-Forwarded-Host', url.hostname)
        headers.set('X-Forwarded-Proto', 'https')
        headers.set('X-Real-IP', clientIP)
        
        // Vercelへリクエスト
        const response = await fetch(targetUrl.toString(), {
          method: request.method,
          headers,
          body: request.body,
          redirect: 'follow' // リダイレクトを自動的に追従
        })
        
        // レスポンスヘッダー
        const responseHeaders = new Headers(response.headers)
        responseHeaders.set('X-Routed-By', 'maintenance-gate')
        
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        })
      }
    }
    
    // それ以外はメンテナンス画面
    return createMaintenanceResponse()
  }
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
      'Retry-After': '300' // 5分後に再試行
    }
  })
}