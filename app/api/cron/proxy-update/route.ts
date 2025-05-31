import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { scrapeRankingViaProxy } from '@/lib/proxy-scraper'
import type { RankingData } from '@/types/ranking'

export const runtime = 'nodejs'

// 更新するランキングの設定
const RANKINGS_TO_UPDATE = [
  // 総合ランキング
  { genre: 'all', term: '24h' as const },
  { genre: 'all', term: 'hour' as const },
  // ジャンル別ランキング
  { genre: 'entertainment', term: '24h' as const },
  { genre: 'entertainment', term: 'hour' as const },
  { genre: 'animal', term: '24h' as const },
  { genre: 'animal', term: 'hour' as const },
  { genre: 'sport', term: '24h' as const },
  { genre: 'sport', term: 'hour' as const },
  { genre: 'cooking', term: '24h' as const },
  { genre: 'cooking', term: 'hour' as const },
  { genre: 'nature', term: '24h' as const },
  { genre: 'nature', term: 'hour' as const },
  { genre: 'travel', term: '24h' as const },
  { genre: 'travel', term: 'hour' as const },
  { genre: 'drive', term: '24h' as const },
  { genre: 'drive', term: 'hour' as const },
  { genre: 'history', term: '24h' as const },
  { genre: 'history', term: 'hour' as const },
  { genre: 'railway', term: '24h' as const },
  { genre: 'railway', term: 'hour' as const },
  { genre: 'technology', term: '24h' as const },
  { genre: 'technology', term: 'hour' as const },
  { genre: 'craft', term: '24h' as const },
  { genre: 'craft', term: 'hour' as const },
  { genre: 'politics', term: '24h' as const },
  { genre: 'politics', term: 'hour' as const },
  { genre: 'science', term: '24h' as const },
  { genre: 'science', term: 'hour' as const },
  { genre: 'material', term: '24h' as const },
  { genre: 'material', term: 'hour' as const },
  { genre: 'social', term: '24h' as const },
  { genre: 'social', term: 'hour' as const },
  { genre: 'game', term: '24h' as const },
  { genre: 'game', term: 'hour' as const },
  { genre: 'commentary', term: '24h' as const },
  { genre: 'commentary', term: 'hour' as const },
  { genre: 'anime', term: '24h' as const },
  { genre: 'anime', term: 'hour' as const },
  { genre: 'music', term: '24h' as const },
  { genre: 'music', term: 'hour' as const },
  { genre: 'sing', term: '24h' as const },
  { genre: 'sing', term: 'hour' as const },
  { genre: 'dance', term: '24h' as const },
  { genre: 'dance', term: 'hour' as const },
  { genre: 'vocaloid', term: '24h' as const },
  { genre: 'vocaloid', term: 'hour' as const },
  { genre: 'nicoindies', term: '24h' as const },
  { genre: 'nicoindies', term: 'hour' as const },
  { genre: 'virtualyoutuber', term: '24h' as const },
  { genre: 'virtualyoutuber', term: 'hour' as const },
  { genre: 'original', term: '24h' as const },
  { genre: 'original', term: 'hour' as const },
  { genre: 'r18', term: '24h' as const },
  { genre: 'r18', term: 'hour' as const },
  // 必要に応じてタグ付きランキングも追加可能
]

export async function POST(request: Request) {
  // 認証チェック
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // プロキシサーバーが設定されているか確認
  if (!process.env.PROXY_URL) {
    return NextResponse.json(
      { error: 'Proxy server not configured' },
      { status: 503 }
    )
  }

  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  }

  // 各ランキングを更新
  for (const config of RANKINGS_TO_UPDATE) {
    try {
      const tag = 'tag' in config ? config.tag : undefined
      console.log(`Updating ${config.genre} ${config.term}${tag ? ` tag:${tag}` : ''} via proxy...`)
      
      // プロキシ経由でスクレイピング
      const { items: scrapedItems, popularTags } = await scrapeRankingViaProxy(
        config.genre,
        config.term,
        tag
      )

      // RankingData形式に変換
      const items: RankingData = scrapedItems.map((item) => ({
        rank: item.rank || 0,
        id: item.id || '',
        title: item.title || '',
        thumbURL: item.thumbURL || '',
        views: item.views || 0,
        comments: item.comments,
        mylists: item.mylists,
        likes: item.likes,
        tags: item.tags,
        authorId: item.authorId,
        authorName: item.authorName,
        authorIcon: item.authorIcon,
        registeredAt: item.registeredAt,
      })).filter(item => item.id && item.title)

      if (items.length > 0) {
        // キャッシュキーを生成
        const cacheKey = tag 
          ? `ranking-${config.genre}-${config.term}-tag-${encodeURIComponent(tag)}`
          : `ranking-${config.genre}-${config.term}`
        
        // KVに保存
        await kv.set(
          cacheKey,
          { items, popularTags, updatedAt: new Date().toISOString() },
          { ex: 3600 } // 1時間のTTL
        )
        
        console.log(`Successfully updated ${cacheKey}: ${items.length} items`)
        results.success++
      } else {
        throw new Error('No items found')
      }

      // レート制限対策で少し待機
      await new Promise(resolve => setTimeout(resolve, 2000))
      
    } catch (error) {
      const errorMessage = `Failed to update ${config.genre} ${config.term}: ${error}`
      console.error(errorMessage)
      results.errors.push(errorMessage)
      results.failed++
    }
  }

  return NextResponse.json({
    message: 'Proxy update completed',
    results,
    timestamp: new Date().toISOString(),
  })
}