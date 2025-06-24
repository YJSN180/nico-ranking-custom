import { NextRequest, NextResponse } from 'next/server'
import { getGenreRanking, getTagRanking } from '@/lib/cloudflare-kv'
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
  
  // Response headers for performance optimization
  const headers = {
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800',
    'CDN-Cache-Control': 'public, s-maxage=3600',
    'X-API-Version': '2'
  }

  try {
    // 開発環境でのテストデータ
    if (process.env.NODE_ENV === 'development' && !process.env.KV_RANKING_ID) {
      const testData = {
        items: [
          {
            id: "sm123456",
            rank: 1,
            title: "テスト動画1 - とても長いタイトルで表示テスト用に使用します。CSS Modulesへの移行後も正しく省略表示されることを確認",
            views: 1234567,
            comments: 12345,
            mylists: 1234,
            likes: 12345,
            thumbURL: "https://nicovideo.cdn.nimg.jp/thumbnails/123456/123456",
            duration: 625,
            authorName: "テスト投稿者1",
            authorId: "12345678",
            authorIcon: "https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/123/12345678.jpg",
            registeredAt: "2025-06-24T10:00:00+09:00"
          },
          {
            id: "sm234567",
            rank: 2,
            title: "テスト動画2 - 短いタイトル",
            views: 987654,
            comments: 9876,
            mylists: 987,
            likes: 9876,
            thumbURL: "https://nicovideo.cdn.nimg.jp/thumbnails/234567/234567",
            duration: 180,
            authorName: "テスト投稿者2",
            authorId: "23456789",
            registeredAt: "2025-06-23T15:30:00+09:00"
          },
          {
            id: "sm345678",
            rank: 3,
            title: "テスト動画3 - モバイル表示テスト",
            views: 567890,
            comments: 5678,
            mylists: 567,
            likes: 5678,
            thumbURL: "https://nicovideo.cdn.nimg.jp/thumbnails/345678/345678",
            duration: 1234,
            authorName: "テスト投稿者3（とても長い名前でオーバーフローのテスト）",
            authorId: "channel/ch12345",
            registeredAt: "2025-06-22T08:00:00+09:00"
          },
          ...Array.from({ length: 97 }, (_, i) => ({
            id: `sm${456789 + i}`,
            rank: i + 4,
            title: `動画${i + 4} - パフォーマンステスト用のデータ`,
            views: Math.floor(Math.random() * 100000),
            comments: Math.floor(Math.random() * 1000),
            mylists: Math.floor(Math.random() * 100),
            likes: Math.floor(Math.random() * 1000),
            thumbURL: `https://nicovideo.cdn.nimg.jp/thumbnails/${456789 + i}/${456789 + i}`,
            duration: Math.floor(Math.random() * 600),
            authorName: `投稿者${i + 4}`,
            authorId: `${34567890 + i}`,
            registeredAt: new Date(Date.now() - (i + 1) * 3600000).toISOString()
          }))
        ]
      }
      return NextResponse.json(testData, { headers })
    }
    
    // Cloudflare KVが利用可能かチェック（環境変数で判定）
    const kvRankingId = process.env.KV_RANKING_ID?.trim()
    const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN?.trim()
    const useCloudflareKV = kvRankingId && cloudflareApiToken && kvRankingId !== '' && cloudflareApiToken !== ''
    
    // CI環境でのデバッグ情報
    if (process.env.CI) {
      // eslint-disable-next-line no-console
      console.log('CI Environment Debug:', {
        hasKvRankingId: !!kvRankingId,
        hasApiToken: !!cloudflareApiToken,
        kvIdLength: kvRankingId?.length || 0,
        apiTokenLength: cloudflareApiToken?.length || 0,
        useCloudflareKV
      })
    }
    
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
            Object.entries(headers).forEach(([key, value]) => {
              response.headers.set(key, value)
            })
            response.headers.set('X-Cache-Status', 'CF-HIT')
            response.headers.set('X-Total-Cached', cfItems.length.toString())
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
          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value)
          })
          response.headers.set('X-Cache-Status', 'CF-HIT')
          response.headers.set('X-Max-Items', String(maxItems))
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