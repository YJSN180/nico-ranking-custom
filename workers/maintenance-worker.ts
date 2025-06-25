/**
 * メンテナンスページWorker
 * 本番デプロイ時に一時的に表示
 */

export default {
  async fetch(request: Request): Promise<Response> {
    const maintenanceHTML = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>メンテナンス中 - ニコラン(Re:turn)</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: "M PLUS Rounded 1c", "Noto Sans JP", sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            max-width: 600px;
            box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
            border: 1px solid rgba(255, 255, 255, 0.18);
        }
        
        h1 {
            font-size: 2.5rem;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
        }
        
        .icon {
            font-size: 3rem;
            animation: rotate 2s linear infinite;
        }
        
        @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        
        p {
            font-size: 1.2rem;
            line-height: 1.8;
            margin-bottom: 15px;
            opacity: 0.9;
        }
        
        .time {
            font-size: 1.5rem;
            font-weight: bold;
            margin: 30px 0;
            padding: 20px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 10px;
        }
        
        .progress {
            width: 100%;
            height: 20px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 10px;
            overflow: hidden;
            margin: 30px 0;
        }
        
        .progress-bar {
            height: 100%;
            background: #4ade80;
            width: 30%;
            border-radius: 10px;
            animation: progress 3s ease-in-out infinite;
        }
        
        @keyframes progress {
            0% { width: 0%; }
            50% { width: 70%; }
            100% { width: 30%; }
        }
        
        .note {
            font-size: 0.9rem;
            opacity: 0.7;
            margin-top: 30px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>
            <span class="icon">🔧</span>
            メンテナンス中
        </h1>
        
        <p>より快適なサービスをお届けするため、</p>
        <p>システムメンテナンスを実施しています。</p>
        
        <div class="time">
            完了予定時刻<br>
            <span id="endTime">-</span>
        </div>
        
        <div class="progress">
            <div class="progress-bar"></div>
        </div>
        
        <p>🚀 キャッシュシステムの高速化</p>
        <p>📊 ランキング更新頻度の向上</p>
        
        <p class="note">
            ご不便をおかけして申し訳ございません。<br>
            もうしばらくお待ちください。
        </p>
    </div>
    
    <script>
        // メンテナンス終了予定時刻を動的に設定（2時間後）
        const endTime = new Date();
        endTime.setHours(endTime.getHours() + 2);
        
        document.getElementById('endTime').textContent = 
            endTime.toLocaleString('ja-JP', {
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric'
            });
    </script>
</body>
</html>
    `.trim();
    
    // APIリクエストの場合はJSONレスポンス
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({
        error: 'メンテナンス中',
        message: 'システムメンテナンスのため、一時的にサービスを停止しています。',
        maintenance: true
      }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }
    
    // それ以外はHTMLページ
    return new Response(maintenanceHTML, {
      status: 503,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }
}