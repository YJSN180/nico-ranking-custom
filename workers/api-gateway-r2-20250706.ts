/**
 * Cloudflare Worker - API Gateway with R2 Integration
 * R2から直接ランキングデータを配信
 */

/// <reference types="@cloudflare/workers-types" />

import { decodeRankingData } from './utils/html-decode'
import { applyCORSHeaders, createOptionsResponse } from './utils/cors-config'

interface Env {
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY: string
  R2_BUCKET: R2Bucket
}

// タグ累積データの型定義
interface TagAccumulationData {
  tags: string[]
  metadata: {
    version: number
    lastUpdated: string
    totalUniqueTags: number
    lastAccumulationSource: string
    weeklyUpdateCount: number
  }
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

// CORSヘッダーは ./utils/cors-config.ts で統一管理

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    
    // OPTIONS リクエストの処理
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin')
      return createOptionsResponse(origin)
    }
    
    // /api/metadata パスの処理（メタデータを返す）
    if (url.pathname === '/api/metadata' && env.R2_BUCKET) {
      try {
        const metadataObject = await env.R2_BUCKET.get('rankings/metadata.json')
        if (metadataObject) {
          const metadata = await metadataObject.text()
          const metadataResponse = new Response(metadata, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300'
            }
          })
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(metadataResponse, origin, securityHeaders)
        }
      } catch (error) {
        console.error('Metadata read error:', error)
      }
      const emptyResponse = new Response('{}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      })
      const origin = request.headers.get('Origin')
      return applyCORSHeaders(emptyResponse, origin, securityHeaders)
    }

    // タグオートコンプリートAPI
    if (url.pathname === '/api/tags/autocomplete' && env.R2_BUCKET) {
      try {
        const query = url.searchParams.get('q') || ''
        
        // クエリが空または2文字未満の場合は空の結果を返す
        if (!query || query.trim().length < 2) {
          const emptyResponse = new Response(JSON.stringify({
            query,
            suggestions: [],
            metadata: {
              total: 0,
              source: 'query-too-short'
            }
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300' // 5分キャッシュ
            }
          })
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(emptyResponse, origin, securityHeaders)
        }

        // R2からタグ累積データを取得
        const tagAccumulationObject = await env.R2_BUCKET.get('tag-accumulation.json')
        
        if (!tagAccumulationObject) {
          // タグ累積データが存在しない場合
          const notFoundResponse = new Response(JSON.stringify({
            query,
            suggestions: [],
            metadata: {
              total: 0,
              source: 'tag-data-not-found',
              error: 'Tag accumulation data not available'
            }
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=60' // 1分キャッシュ
            }
          })
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(notFoundResponse, origin, securityHeaders)
        }

        // タグ累積データを解析
        let tagData: TagAccumulationData
        try {
          // gzip圧縮対応
          const reader = tagAccumulationObject.body.getReader()
          const { value: firstChunk } = await reader.read()
          reader.releaseLock()
          
          const isGzipped = firstChunk && firstChunk.length >= 2 && 
                           firstChunk[0] === 0x1f && firstChunk[1] === 0x8b
          
          if (isGzipped) {
            // gzip解凍
            const compressedData = await tagAccumulationObject.arrayBuffer()
            const decompressedData = await new Response(
              new Blob([compressedData]).stream().pipeThrough(new DecompressionStream('gzip'))
            ).text()
            tagData = JSON.parse(decompressedData)
          } else {
            // 非圧縮データ
            const textData = await tagAccumulationObject.text()
            tagData = JSON.parse(textData)
          }
        } catch (parseError) {
          console.error('Failed to parse tag accumulation data:', parseError)
          const errorResponse = new Response(JSON.stringify({
            query,
            suggestions: [],
            metadata: {
              total: 0,
              source: 'parse-error',
              error: 'Failed to parse tag data'
            }
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            }
          })
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(errorResponse, origin, securityHeaders)
        }

        // プレフィックス検索を実行
        const lowerQuery = query.toLowerCase()
        const maxResults = parseInt(url.searchParams.get('limit') || '10')
        const suggestions = (tagData.tags || [])
          .filter((tag: string) => tag.toLowerCase().startsWith(lowerQuery))
          .slice(0, maxResults)

        // レスポンスを構築
        const autocompleteResponse = {
          query,
          suggestions,
          metadata: {
            total: suggestions.length,
            maxResults,
            source: 'r2-tag-accumulation',
            lastUpdated: tagData.metadata?.lastUpdated || null,
            totalUniqueTags: tagData.metadata?.totalUniqueTags || 0
          }
        }

        const response = new Response(JSON.stringify(autocompleteResponse), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=1800' // 30分キャッシュ（タグデータは比較的安定）
          }
        })
        
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(response, origin, securityHeaders)

      } catch (error) {
        console.error('Tag autocomplete error:', error)
        const errorResponse = new Response(JSON.stringify({
          query: url.searchParams.get('q') || '',
          suggestions: [],
          metadata: {
            total: 0,
            source: 'error',
            error: error.message
          }
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        })
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(errorResponse, origin, securityHeaders)
      }
    }
    
    // デバッグエンドポイント
    if (url.pathname === '/api/debug') {
      const debugResponse = new Response(JSON.stringify({
        time: new Date().toISOString(),
        headers: Object.fromEntries(request.headers.entries()),
        worker: 'api-gateway-r2-20250706',
        version: 'r2-20250706-unified-cors'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      const origin = request.headers.get('Origin')
      return applyCORSHeaders(debugResponse, origin, {})
    }
    
    // R2メタデータテストエンドポイント
    if (url.pathname === '/api/test-r2-metadata') {
      try {
        const testKey = 'rankings/all/24h/all.json'
        const testObject = await env.R2_BUCKET.get(testKey)
        
        if (testObject) {
          // 最初の10バイトを読み取ってgzip確認
          const reader = testObject.body.getReader()
          const { value: firstChunk } = await reader.read()
          reader.releaseLock()
          
          const isGzipped = firstChunk && firstChunk.length >= 2 && 
                           firstChunk[0] === 0x1f && firstChunk[1] === 0x8b
          
          const testResponse = new Response(JSON.stringify({
            key: testKey,
            exists: true,
            size: testObject.size,
            httpMetadata: testObject.httpMetadata || {},
            customMetadata: testObject.customMetadata || {},
            firstBytes: firstChunk ? Array.from(firstChunk.slice(0, 10)) : [],
            isGzipped: isGzipped
          }, null, 2), {
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            }
          })
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(testResponse, origin, {})
        } else {
          const notFoundResponse = new Response(JSON.stringify({
            key: testKey,
            exists: false
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            }
          })
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(notFoundResponse, origin, {})
        }
      } catch (error) {
        const errorResponse = new Response(JSON.stringify({
          error: error.message
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json'
          }
        })
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(errorResponse, origin, {})
      }
    }
    
    // /api/ranking パスの処理（R2から直接配信）
    if (url.pathname === '/api/ranking' && env.R2_BUCKET) {
      try {
        // クエリパラメータからジャンルと期間を取得
        const genre = url.searchParams.get('genre') || 'all'
        const period = url.searchParams.get('period') || '24h'
        const tag = url.searchParams.get('tag')
        
        // R2のキーを構築
        let r2Key: string
        let cacheKeySuffix: string
        
        if (tag) {
          // タグ別ランキング
          const encodedTag = encodeURIComponent(tag)
          r2Key = `rankings/${genre}/${period}/tags/${encodedTag}.json`
          cacheKeySuffix = `${genre}/${period}/tags/${encodedTag}`
        } else {
          // ジャンル別「すべて」ランキング
          r2Key = `rankings/${genre}/${period}/all.json`
          cacheKeySuffix = `${genre}/${period}/all`
        }
        
        // R2から読み取り
        console.log(`[Worker] Attempting to read from R2: ${r2Key}`)
        const r2Object = await env.R2_BUCKET.get(r2Key)
        
        // R2オブジェクトのデバッグ情報
        if (r2Object) {
          console.log(`[Worker] R2 object found, size: ${r2Object.size}`)
          console.log(`[Worker] R2 httpMetadata:`, JSON.stringify(r2Object.httpMetadata || {}))
          console.log(`[Worker] R2 customMetadata:`, JSON.stringify(r2Object.customMetadata || {}))
        }
        
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
            // 空のレスポンスでもデコード処理を通す（将来の一貫性のため）
            const decodedEmptyResponse = decodeRankingData(emptyResponse)
            const emptyRankingResponse = new Response(JSON.stringify(decodedEmptyResponse), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'X-Data-Source': 'r2-tag-not-found'
              }
            })
            const origin = request.headers.get('Origin')
            return applyCORSHeaders(emptyRankingResponse, origin, securityHeaders)
          } else {
            // 通常のランキングデータが存在しない場合はVercelにフォールバック
            console.log(`R2 miss for ${r2Key}, falling back to Vercel`)
            return proxyToVercel(request, env)
          }
        }
        
        // R2から取得したデータを返す
        // Stream処理で効率的に実装（専門家の推奨案）
        const headers = new Headers()
        headers.set('Content-Type', 'application/json')
        
        // キャッシュ設定 (Vercel設定と統一: 20分TTL)
        // Cloudflare CDNとTiered Cachingが自動的に適用される
        headers.set('Cache-Control', 'public, max-age=1200, s-maxage=1200, stale-while-revalidate=2400')
        
        // Cloudflare固有のキャッシュ設定
        headers.set('CDN-Cache-Control', 'public, max-age=1200')
        headers.set('X-Data-Source', 'r2-direct')
        
        // セキュリティヘッダーを追加
        Object.entries(securityHeaders).forEach(([key, value]) => {
          headers.set(key, value)
        })
        
        // R2オブジェクトのメタデータから圧縮情報を取得
        const r2ContentEncoding = r2Object.httpMetadata?.contentEncoding
        const r2ContentType = r2Object.httpMetadata?.contentType
        console.log(`[Worker] R2 object httpMetadata.contentEncoding: ${r2ContentEncoding}`)
        console.log(`[Worker] R2 object httpMetadata.contentType: ${r2ContentType}`)
        
        // Content-Encodingヘッダーは設定しない
        // Cloudflareが自動的に圧縮を処理するため、手動での設定は避ける
        // これにより、ヘッダーとボディの不一致を防ぐ
        
        // ストリームを分割して最初のチャンクを検査
        const [inspectStream, passthroughStream] = r2Object.body.tee()
        
        const reader = inspectStream.getReader()
        const { value: firstChunk, done } = await reader.read()
        reader.releaseLock()
        
        // gzipマジックナンバーチェック (0x1f, 0x8b)
        const isGzipped = !done && firstChunk && firstChunk.length >= 2 && firstChunk[0] === 0x1f && firstChunk[1] === 0x8b
        
        if (isGzipped) {
          console.log(`[Worker] Data is gzipped, decompressing and decoding`)
          
          // gzip圧縮されたデータを解凍してから送信
          // これにより、Content-Encodingヘッダーとデータの不一致を防ぐ
          try {
            // ストリーム全体を読み込んで解凍
            const compressedData = await new Response(passthroughStream).arrayBuffer()
            const decompressedData = await new Response(
              new Blob([compressedData]).stream().pipeThrough(new DecompressionStream('gzip'))
            ).text()
            
            // JSONをパースしてHTMLエンティティをデコード
            try {
              const jsonData = JSON.parse(decompressedData)
              const decodedData = decodeRankingData(jsonData)
              
              // デコード済みデータを返す（Cloudflareが必要に応じて再圧縮）
              const decodedResponse = new Response(JSON.stringify(decodedData), {
                status: 200,
                headers
              })
              const origin = request.headers.get('Origin')
              return applyCORSHeaders(decodedResponse, origin, securityHeaders)
            } catch (parseError) {
              console.error('[Worker] Failed to parse or decode JSON:', parseError)
              // パースに失敗した場合は元のデータをそのまま返す
              const fallbackResponse = new Response(decompressedData, {
                status: 200,
                headers
              })
              const origin = request.headers.get('Origin')
              return applyCORSHeaders(fallbackResponse, origin, securityHeaders)
            }
          } catch (decompressError) {
            console.error('[Worker] Failed to decompress gzipped data:', decompressError)
            // 解凍に失敗した場合は、元のストリームをそのまま返す
            const streamResponse = new Response(passthroughStream, {
              status: 200,
              headers
            })
            const origin = request.headers.get('Origin')
            return applyCORSHeaders(streamResponse, origin, securityHeaders)
          }
        } else {
          // 非圧縮データの場合
          console.log(`[Worker] Data is not gzipped, decoding HTML entities`)
          
          try {
            // データを読み込んでJSONパース
            const textData = await new Response(passthroughStream).text()
            const jsonData = JSON.parse(textData)
            const decodedData = decodeRankingData(jsonData)
            
            // デコード済みデータを返す（Cloudflareが自動圧縮する）
            const uncompressedResponse = new Response(JSON.stringify(decodedData), {
              status: 200,
              headers
            })
            const origin = request.headers.get('Origin')
            return applyCORSHeaders(uncompressedResponse, origin, securityHeaders)
          } catch (error) {
            console.error('[Worker] Failed to parse or decode JSON:', error)
            // エラーの場合は元のストリームをそのまま返す
            const errorFallbackResponse = new Response(passthroughStream, {
              status: 200,
              headers
            })
            const origin = request.headers.get('Origin')
            return applyCORSHeaders(errorFallbackResponse, origin, securityHeaders)
          }
        }
        
      } catch (error) {
        console.error('R2 read error:', error)
        // エラー時はVercelにフォールバック
        return proxyToVercel(request, env)
      }
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
    
    // CORSヘッダーは最後にapplyCORSHeadersで統一適用
    
    const proxyResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    })
    
    const origin = request.headers.get('Origin')
    return applyCORSHeaders(proxyResponse, origin, {})
  } catch (error) {
    console.error('Proxy error:', error)
    const errorResponse = new Response('Gateway Error', { 
      status: 502,
      headers: {
        'Content-Type': 'text/plain'
      }
    })
    const origin = request.headers.get('Origin')
    return applyCORSHeaders(errorResponse, origin, {})
  }
}