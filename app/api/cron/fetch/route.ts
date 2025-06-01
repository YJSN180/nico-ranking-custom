import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { scrapeRankingPage } from '@/lib/scraper'
// import { mockRankingData } from '@/lib/mock-data' // モックデータは使用しない
import type { RankingData, RankingItem } from '@/types/ranking'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 人気ジャンルのデータを取得してキャッシュ
    const genres = ['all', 'game', 'entertainment', 'music', 'other', 'tech', 'anime', 'animal', 'd2um7mc4']
    const periods: ('24h' | 'hour')[] = ['24h', 'hour']
    let allSuccess = true
    let totalItems = 0
    
    for (const genre of genres) {
      for (const period of periods) {
        try {
          const { items: scrapedItems, popularTags } = await scrapeRankingPage(genre, period, undefined)
        
        // Partial<RankingItem>をRankingItemに変換
        const items: RankingData = scrapedItems.map((item): RankingItem => ({
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
        })).filter((item: any) => item.id && item.title)
        
        // ジャンル別・期間別にキャッシュ
        await kv.set(`ranking-${genre}-${period}`, { items, popularTags }, { ex: 3600 })
        
        // 後方互換性のため、24hのデータは旧形式のキーにも保存
        if (period === '24h') {
          await kv.set(`ranking-${genre}`, { items, popularTags }, { ex: 3600 })
          
          // 'all'ジャンルは'ranking-data'にも保存
          if (genre === 'all') {
            await kv.set('ranking-data', items, { ex: 3600 })
            totalItems = items.length
          }
        }
        
        // 人気タグ別のデータも事前生成（上位5タグのみ、24hのみ）
        if (period === '24h' && popularTags && popularTags.length > 0 && genre !== 'all') {
          for (const tag of popularTags.slice(0, 5)) {
            const taggedItems = items.filter((item: any) => item.tags?.includes(tag))
            if (taggedItems.length > 0) {
              await kv.set(`ranking-${genre}-${period}-tag-${encodeURIComponent(tag)}`, taggedItems, { ex: 3600 })
              // 後方互換性
              await kv.set(`ranking-${genre}-tag-${encodeURIComponent(tag)}`, taggedItems, { ex: 3600 })
            }
          }
        }
        } catch (error) {
          console.error(`Failed to fetch ${genre} ${period} ranking:`, error)
          allSuccess = false
          
          // エラー時は空のデータを設定（モックデータは使用しない）
          if (genre === 'all' && period === '24h') {
            await kv.set('ranking-data', [], { ex: 3600 })
            await kv.set('ranking-all', { items: [], popularTags: [] }, { ex: 3600 })
            await kv.set('ranking-all-24h', { items: [], popularTags: [] }, { ex: 3600 })
            totalItems = 0
          }
        }
      }
    }
    
    // Store update info
    await kv.set('last-update-info', {
      timestamp: new Date().toISOString(),
      genres: genres.length,
      source: 'scheduled-cron',
      allSuccess
    })

    return NextResponse.json({
      success: true,
      itemsCount: totalItems,
      timestamp: new Date().toISOString(),
      allSuccess,
      genresProcessed: genres.length,
      isMock: !allSuccess && totalItems === 100 // モックデータを使用した場合
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch ranking' },
      { status: 500 }
    )
  }
}