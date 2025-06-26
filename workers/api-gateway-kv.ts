/**
 * Cloudflare Worker - API Gateway with KV Integration
 * KVから直接ランキングデータを配信
 */

/// <reference types="@cloudflare/workers-types" />

interface Env {
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY: string
  RANKING_DATA: KVNamespace
  ENVIRONMENT?: string
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

// 圧縮データの解凍（Web API標準）
async function decompressData(compressedData: ArrayBuffer): Promise<any> {
  try {
    // gzip解凍（ブラウザ標準のDecompressionStreamを使用）
    const decompressionStream = new DecompressionStream('gzip')
    const writer = decompressionStream.writable.getWriter()
    writer.write(compressedData)
    writer.close()
    
    const reader = decompressionStream.readable.getReader()
    const chunks: Uint8Array[] = []
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    
    // Uint8Arrayの配列を結合
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    
    // UTF-8デコードしてJSONパース
    const text = new TextDecoder().decode(result)
    return JSON.parse(text)
  } catch (error) {
    console.error('Decompression error:', error)
    throw error
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // OPTIONS リクエストの処理
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      })
    }
    
    // /api/ranking パスでKVから読み込み
    if (url.pathname === '/api/ranking' && env.RANKING_DATA) {
      try {
        // クエリパラメータ取得
        const genre = url.searchParams.get('genre') || 'all'
        const period = url.searchParams.get('period') || '24h'
        const tag = url.searchParams.get('tag')
        
        // Workers Cacheキー
        const cacheKeySuffix = tag 
          ? `${genre}/${period}/tags/${encodeURIComponent(tag)}`
          : `${genre}/${period}/all`
        const cacheKey = new Request(`https://kv-cache.nico-rank.com/ranking/${cacheKeySuffix}`, request)
        const cache = caches.default
        
        // キャッシュチェック
        let response = await cache.match(cacheKey)
        if (response) {
          // キャッシュヒット
          response = new Response(response.body, response)
          response.headers.set('X-Cache-Status', 'HIT')
          return response
        }
        
        // KVから取得（3キー分割方式）
        console.log(`[Worker] Reading from KV with 3-key split`)
        const kvData = await env.RANKING_DATA.get('RANKING_LATEST', { type: 'arrayBuffer' })
        
        if (!kvData) {
          console.log(`[Worker] No data found in KV`)
          // データが見つからない場合
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
              'X-Data-Source': 'kv-not-found',
              ...corsHeaders,
              ...securityHeaders
            }
          })
        }
        
        // 圧縮データを解凍
        const decompressedData = await decompressData(kvData)
        
        // ジャンル・期間・タグに応じてデータをフィルタリング
        const genreData = decompressedData.genres?.[genre]?.[period]
        
        if (!genreData) {
          console.log(`[Worker] No data found for ${genre}/${period}`)
          const emptyResponse = {
            items: [],
            popularTags: [],
            metadata: {
              version: 1,
              updatedAt: decompressedData.metadata?.updatedAt || new Date().toISOString(),
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
              'X-Data-Source': 'kv-genre-not-found',
              ...corsHeaders,
              ...securityHeaders
            }
          })
        }
        
        let responseData
        if (tag) {
          // タグ別データ
          const tagData = genreData.tags?.[tag]
          if (!tagData || !Array.isArray(tagData)) {
            // タグデータが存在しない場合
            responseData = {
              items: [],
              popularTags: genreData.popularTags || [],
              metadata: {
                version: 1,
                updatedAt: decompressedData.metadata?.updatedAt || new Date().toISOString(),
                genre,
                period,
                tag
              }
            }
          } else {
            responseData = {
              items: tagData,
              popularTags: genreData.popularTags || [],
              metadata: {
                version: 1,
                updatedAt: decompressedData.metadata?.updatedAt || new Date().toISOString(),
                genre,
                period,
                tag
              }
            }
          }
        } else {
          // 通常のランキングデータ
          responseData = {
            items: genreData.items || [],
            popularTags: genreData.popularTags || [],
            metadata: {
              version: 1,
              updatedAt: decompressedData.metadata?.updatedAt || new Date().toISOString(),
              genre,
              period
            }
          }
        }
        
        const responseBody = JSON.stringify(responseData)
        console.log(`[Worker] Returning ${responseData.items.length} items for ${genre}/${period}${tag ? `/${tag}` : ''}`)
        
        response = new Response(responseBody, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=1800, s-maxage=3600',
            'X-Data-Source': 'kv-direct',
            'X-Cache-Status': 'MISS',
            ...corsHeaders,
            ...securityHeaders
          }
        })
        
        // キャッシュに保存
        ctx.waitUntil(cache.put(cacheKey, response.clone()))
        
        return response
        
      } catch (error) {
        console.error('KV read error:', error)
        // エラー時は空のレスポンスを返す
        return new Response(JSON.stringify({
          items: [],
          popularTags: [],
          error: 'Failed to fetch data'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
            ...securityHeaders
          }
        })
      }
    }
    
    // その他のパスは404
    return new Response('Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain',
        ...corsHeaders,
        ...securityHeaders
      }
    })
  }
}