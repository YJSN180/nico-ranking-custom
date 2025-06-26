import { NextRequest, NextResponse } from 'next/server'
import { generateMockRankingData, generateMockPopularTags, isDevelopmentWithoutKV } from '@/lib/mock-data'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import type { RankingItem } from '@/types/ranking'

// Node.js Runtimeを使用（環境変数の問題を回避）
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const genre = searchParams.get('genre') || 'all'
  const period = searchParams.get('period') || '24h'
  const tag = searchParams.get('tag') || undefined

  // Validate inputs - period のみチェック（genreはすべて受け入れる）
  const validPeriods = ['24h', 'hour']
  
  if (!validPeriods.includes(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }

  try {
    // 開発環境でKVが設定されていない場合はモックデータを返す
    if (isDevelopmentWithoutKV()) {
      // [Development] Using mock data - KV not configured
      
      const mockItems = generateMockRankingData(500)
      const mockPopularTagObjects = generateMockPopularTags()
      // PopularTagオブジェクトから名前のみの配列に変換
      const mockPopularTags = mockPopularTagObjects.map(tag => tag.name)
      
      // タグ別ランキングの処理
      if (tag) {
        // タグに該当する動画のみフィルタリング
        const taggedItems = mockItems
          .filter(item => item.tags.includes(tag))
          .slice(0, 100) // タグ別は最大100件
        
        if (taggedItems.length === 0) {
          return NextResponse.json(
            { 
              error: 'Tag ranking not found. This tag may not be in the popular tags list.',
              items: [],
              hasMore: false,
              totalCached: 0
            },
            { status: 404 }
          )
        }
        
        const response = NextResponse.json({
          items: taggedItems,
          hasMore: false,
          totalCached: taggedItems.length
        })
        response.headers.set('X-Data-Source', 'mock')
        response.headers.set('X-Environment', 'development')
        return response
      }
      
      // ジャンル別ランキング（開発環境ではジャンルフィルタリングなし）
      const response = NextResponse.json({
        items: mockItems,
        popularTags: mockPopularTags,
        hasMore: false,
        totalCached: mockItems.length
      })
      response.headers.set('X-Data-Source', 'mock')
      response.headers.set('X-Environment', 'development')
      return response
    }
    
    // Cloudflare Workers API Gatewayを使用
    const apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL
    
    if (!apiGatewayUrl) {
      // [API] NEXT_PUBLIC_API_GATEWAY_URL is not configured
      return NextResponse.json(
        { error: 'API Gateway URLが設定されていません。' },
        { status: 500 }
      )
    }
    
    // Cloudflare Workers経由でデータを取得
    try {
      const params = new URLSearchParams()
      params.set('genre', genre)
      params.set('period', period)
      if (tag) params.set('tag', tag)
      
      const workerUrl = `${apiGatewayUrl}/api/ranking?${params.toString()}`
      // [API] Fetching from Worker: ${workerUrl}
      
      const workerResponse = await fetch(workerUrl, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate, br',
          'X-Worker-Auth': process.env.WORKER_AUTH_KEY || ''
        },
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(30000) // 30 seconds timeout
      })
      
      if (!workerResponse.ok) {
        // [API] Worker returned error: ${workerResponse.status} ${workerResponse.statusText}
        
        // タグが見つからない場合
        if (workerResponse.status === 404 && tag) {
          return NextResponse.json(
            { 
              error: 'Tag ranking not found. This tag may not be in the popular tags list.',
              items: [],
              hasMore: false,
              totalCached: 0
            },
            { status: 404 }
          )
        }
        
        // その他のエラー
        return NextResponse.json(
          { error: `Worker error: ${workerResponse.status}` },
          { status: workerResponse.status }
        )
      }
      
      // レスポンスをパース
      const data = await workerResponse.json()
      
      // タグ別ランキングの処理
      if (tag && data.items) {
        const response = NextResponse.json({
          items: data.items,
          hasMore: false,
          totalCached: data.items.length
        })
        response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=1800')
        response.headers.set('X-Cache-Status', 'WORKER-HIT')
        response.headers.set('X-Total-Cached', data.items.length.toString())
        response.headers.set('X-API-Version', '3') // Worker経由バージョン
        return response
      }
      
      // ジャンル別ランキング
      if (data.items) {
        const maxItems = 500
        const items = data.items.slice(0, maxItems)
        
        const response = NextResponse.json({
          items: items,
          popularTags: data.popularTags || [],
          hasMore: false,
          totalCached: data.items.length
        })
        response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=1800')
        response.headers.set('X-Cache-Status', 'WORKER-HIT')
        response.headers.set('X-Max-Items', String(maxItems))
        response.headers.set('X-API-Version', '3') // Worker経由バージョン
        return response
      }
      
      // データが空の場合
      return NextResponse.json(
        { error: 'ランキングデータが見つかりません。' },
        { status: 503 }
      )
      
    } catch (error) {
      // [API] Worker fetch error:
      
      // AbortError (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json(
          { error: 'API Gateway timeout' },
          { status: 504 }
        )
      }
      
      return NextResponse.json(
        { error: 'API Gateway connection failed' },
        { status: 503 }
      )
    }
    
  } catch (error) {
    // [API] Unexpected error:
    // API error - return error response
    return NextResponse.json(
      { error: 'ランキングデータの取得に失敗しました。' },
      { status: 503 }
    )
  }
}