export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const cache = caches.default
    
    // キャッシュキーの作成
    const cacheKey = new Request(url.toString(), request)
    
    // キャッシュチェック
    let response = await cache.match(cacheKey)
    if (response) {
      return response
    }
    
    // 画像URLの検証とパース
    const imageUrl = url.searchParams.get('url')
    const width = url.searchParams.get('w')
    const quality = url.searchParams.get('q') || '85'
    
    if (!imageUrl) {
      return new Response('Missing image URL', { status: 400 })
    }
    
    // ニコニコ動画のサムネイルURLのみ許可
    const allowedHosts = [
      'nicovideo.cdn.nimg.jp',
      'tn.smilevideo.jp',
      'secure-dcdn.cdn.nimg.jp'
    ]
    
    try {
      const imageUrlObj = new URL(imageUrl)
      if (!allowedHosts.includes(imageUrlObj.hostname)) {
        return new Response('Invalid image host', { status: 403 })
      }
    } catch {
      return new Response('Invalid image URL', { status: 400 })
    }
    
    // 画像を取得
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CloudflareWorker/1.0)',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    })
    
    if (!imageResponse.ok) {
      return new Response('Failed to fetch image', { status: imageResponse.status })
    }
    
    // レスポンスヘッダーの設定
    const headers = new Headers(imageResponse.headers)
    
    // Cloudflare Polish用のヘッダー設定
    // 無料プランでも利用可能
    headers.set('cf-polish', 'lossless') // または 'lossy' for more compression
    
    // キャッシュ制御
    headers.set('Cache-Control', 'public, max-age=2592000, immutable') // 30日
    headers.set('CDN-Cache-Control', 'max-age=2592000')
    
    // WebP対応ブラウザの判定
    const acceptHeader = request.headers.get('Accept') || ''
    const supportsWebP = acceptHeader.includes('image/webp')
    
    if (supportsWebP) {
      headers.set('Vary', 'Accept')
      // Cloudflareが自動的にWebPに変換
    }
    
    // リサイズオプション（Cloudflare Image Resizingが必要）
    // 無料プランでは使用不可なので、クライアント側でサイズ指定
    if (width) {
      headers.set('X-Requested-Width', width)
    }
    
    // セキュリティヘッダー
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('X-Frame-Options', 'DENY')
    
    response = new Response(imageResponse.body, {
      status: imageResponse.status,
      statusText: imageResponse.statusText,
      headers
    })
    
    // キャッシュに保存（最大500MBまで）
    ctx.waitUntil(cache.put(cacheKey, response.clone()))
    
    return response
  }
}