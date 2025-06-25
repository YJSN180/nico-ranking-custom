import { NextRequest, NextResponse } from 'next/server'

// 開発環境用: 外部Workerにプロキシする設定
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  // 環境変数から開発Worker URLを取得
  const devWorkerUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 
                       'https://nico-ranking-dynamic-cache-dev.yjsn180180.workers.dev'
  
  // プロキシ先URLを構築
  const proxyUrl = new URL('/api/ranking', devWorkerUrl)
  proxyUrl.search = searchParams.toString()
  
  try {
    console.log(`[DEV] Proxying to: ${proxyUrl.toString()}`)
    
    // リクエストヘッダーを転送（If-None-Matchなど）
    const requestHeaders: HeadersInit = {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate, br',
      'User-Agent': 'NextJS-Dev-Proxy/1.0'
    }
    
    // If-None-Matchヘッダーがある場合は転送
    const ifNoneMatch = request.headers.get('if-none-match')
    if (ifNoneMatch) {
      requestHeaders['If-None-Match'] = ifNoneMatch
    }
    
    const response = await fetch(proxyUrl.toString(), {
      method: 'GET',
      headers: requestHeaders
    })
    
    // 304 Not Modifiedの場合は特別な処理
    if (response.status === 304) {
      const responseHeaders = new Headers()
      
      // 必要なヘッダーをコピー
      response.headers.forEach((value, key) => {
        const lowerKey = key.toLowerCase()
        if (lowerKey.startsWith('x-') || 
            lowerKey === 'cache-control' ||
            lowerKey === 'cdn-cache-control' ||
            lowerKey === 'etag') {
          responseHeaders.set(key, value)
        }
      })
      
      // 開発環境識別用ヘッダー追加
      responseHeaders.set('X-Proxy-Source', 'nextjs-dev')
      responseHeaders.set('X-Worker-URL', devWorkerUrl)
      
      return new Response(null, {
        status: 304,
        headers: responseHeaders
      })
    }
    
    if (!response.ok) {
      throw new Error(`Worker response: ${response.status} ${response.statusText}`)
    }
    
    // レスポンスボディを処理（圧縮も考慮）
    const contentEncoding = response.headers.get('content-encoding')
    let data: ArrayBuffer | string
    
    if (contentEncoding && contentEncoding.includes('gzip')) {
      // 圧縮されたデータはそのまま転送
      data = await response.arrayBuffer()
    } else {
      data = await response.text()
    }
    
    const responseHeaders = new Headers()
    
    // 必要なヘッダーをコピー
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase()
      if (lowerKey.startsWith('x-') || 
          lowerKey === 'cache-control' ||
          lowerKey === 'cdn-cache-control' ||
          lowerKey === 'etag' ||
          lowerKey === 'content-encoding') {
        responseHeaders.set(key, value)
      }
    })
    
    // 開発環境識別用ヘッダー追加
    responseHeaders.set('X-Proxy-Source', 'nextjs-dev')
    responseHeaders.set('X-Worker-URL', devWorkerUrl)
    responseHeaders.set('Content-Type', 'application/json')
    
    return new Response(data, {
      status: response.status,
      headers: responseHeaders
    })
    
  } catch (error) {
    console.error('[DEV] Proxy error:', error)
    return NextResponse.json(
      { 
        error: 'Development Worker connection failed',
        workerUrl: devWorkerUrl,
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 502 }
    )
  }
}