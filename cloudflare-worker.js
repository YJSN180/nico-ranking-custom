/**
 * Cloudflare Worker - Nico Nico RSS Proxy
 * 
 * このコードをCloudflare Workerにデプロイしてください。
 * 日本国外からのアクセスをプロキシして、ニコニコ動画のRSSフィードを取得します。
 */

export default {
  async fetch(request, env, ctx) {
    // CORSヘッダーの設定
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }

    // OPTIONSリクエストへの対応
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    try {
      // URLパラメータからターゲットURLを取得
      const url = new URL(request.url)
      const targetUrl = url.searchParams.get('url')

      if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        })
      }

      // ニコニコ動画のURLかチェック
      const targetUrlObj = new URL(targetUrl)
      if (!targetUrlObj.hostname.includes('nicovideo.jp')) {
        return new Response(JSON.stringify({ error: 'Invalid target URL' }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        })
      }

      // ニコニコ動画へのリクエスト
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })

      // レスポンスの確認
      if (!response.ok) {
        console.error(`RSS fetch failed: ${response.status} ${response.statusText}`)
        return new Response(JSON.stringify({ 
          error: 'Failed to fetch RSS', 
          status: response.status,
          statusText: response.statusText 
        }), {
          status: response.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        })
      }

      // コンテンツタイプの確認
      const contentType = response.headers.get('content-type')
      
      // レスポンスボディの取得
      const body = await response.text()

      // CORSヘッダーを追加してレスポンスを返す
      return new Response(body, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': contentType || 'application/xml',
          'Cache-Control': 'public, max-age=300' // 5分間キャッシュ
        }
      })

    } catch (error) {
      console.error('Worker error:', error)
      return new Response(JSON.stringify({ 
        error: 'Internal server error', 
        message: error.message 
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      })
    }
  }
}