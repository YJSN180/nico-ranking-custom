import { NextRequest, NextResponse } from 'next/server'
import { getGenreRanking, getTagRanking } from '@/lib/cloudflare-kv'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import type { RankingItem } from '@/types/ranking'

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
    // Cloudflare KVが利用可能かチェック（環境変数で判定）
    const useCloudflareKV = process.env.CLOUDFLARE_KV_NAMESPACE_ID ? true : false
    
    // タグ別ランキングの処理
    if (tag) {
      // Cloudflare KVからの取得を試みる
      if (useCloudflareKV) {
        try {
          const cfItems = await getTagRanking(genre, period as RankingPeriod, tag)
          if (cfItems && cfItems.length > 0) {
            // タグ別ランキングは全件返す（KVに保存されている分すべて）
            const response = NextResponse.json({
              items: cfItems, // 全件返す（239件など）
              hasMore: false, // タグ別ランキングは常にfalse
              totalCached: cfItems.length
            })
            response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=1800')
            response.headers.set('X-Cache-Status', 'CF-HIT')
            response.headers.set('X-Total-Cached', cfItems.length.toString())
            response.headers.set('X-API-Version', '2') // バージョン確認用
            return response
          }
        } catch (error) {
          // Cloudflare KV error - silently fallback to dynamic fetch
        }
      }
      
      // KVにデータがない場合は、タグが人気タグリストにない可能性がある
      // 404 Not Foundを返す（500エラーではなく）
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

    // 通常のジャンル別ランキング
    
    // Cloudflare KVからの取得を試みる
    if (useCloudflareKV) {
      try {
        const cfData = await getGenreRanking(genre, period as RankingPeriod)
        if (cfData && cfData.items && cfData.items.length > 0) {
          // ジャンル別ランキングは500件まで返す
          const maxItems = 500
          const items = cfData.items.slice(0, maxItems)
          
          const response = NextResponse.json({
            items: items,
            popularTags: cfData.popularTags || [],
            hasMore: false, // ページネーションなし
            totalCached: cfData.items.length
          })
          response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=1800')
          response.headers.set('X-Cache-Status', 'CF-HIT')
          response.headers.set('X-Max-Items', String(maxItems))
          response.headers.set('X-API-Version', '2') // バージョン確認用
          return response
        }
      } catch (error) {
        // Cloudflare KV error - silently fallback to dynamic fetch
      }
    }
    
    // KVにデータがない場合はエラーを返す
    return NextResponse.json(
      { error: 'ランキングデータが見つかりません。しばらくしてから再度お試しください。' },
      { status: 503 }
    )
    
  } catch (error) {
    // API error - return error response
    return NextResponse.json(
      { error: 'ランキングデータの取得に失敗しました。' },
      { status: 503 }
    )
  }
}