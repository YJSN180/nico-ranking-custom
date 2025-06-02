import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { scrapeRankingPage } from '@/lib/scraper'
import { filterRankingData } from '@/lib/ng-filter'
import { CACHED_GENRES } from '@/types/ranking-config'
// import { mockRankingData } from '@/lib/mock-data' // モックデータは使用しない
import type { RankingData, RankingItem } from '@/types/ranking'

export const runtime = 'nodejs'

// Vercel Cronは無効化（GitHub Actionsを使用）
// export const crons = [
//   {
//     path: '/api/cron/fetch',
//     schedule: '15,45 * * * *'
//   }
// ]

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 重複実行を防ぐため、最終更新時刻をチェック
  const lastUpdateKey = 'last-cron-execution'
  const lastUpdate = await kv.get(lastUpdateKey) as string | null
  if (lastUpdate) {
    const lastUpdateTime = new Date(lastUpdate).getTime()
    const now = Date.now()
    const fiveMinutes = 5 * 60 * 1000
    
    if (now - lastUpdateTime < fiveMinutes) {
      return NextResponse.json({
        error: 'Too soon',
        message: 'Cron job was executed recently. Please wait at least 5 minutes.',
        lastUpdate,
        nextAllowedTime: new Date(lastUpdateTime + fiveMinutes).toISOString()
      }, { status: 429 })
    }
  }
  
  // 実行開始時刻を記録
  await kv.set(lastUpdateKey, new Date().toISOString(), { ex: 3600 })

  try {
    // 人気ジャンルのデータを取得してキャッシュ
    const genres = CACHED_GENRES
    const periods: ('24h' | 'hour')[] = ['24h', 'hour']
    let allSuccess = true
    let totalItems = 0
    
    for (const genre of genres) {
      for (const period of periods) {
        try {
          // 300件（NGフィルタリング後）を確保するため、必要に応じて追加ページを取得
          const targetCount = 300
          const allItems: RankingItem[] = []
          let popularTags: string[] = []
          let page = 1
          const maxPages = 5 // 最大5ページまで取得
          
          while (allItems.length < targetCount && page <= maxPages) {
            const { items: pageItems, popularTags: pageTags } = await scrapeRankingPage(genre, period, undefined, 100, page)
            
            // 最初のページから人気タグを取得
            if (page === 1 && pageTags) {
              popularTags = pageTags
            }
            
            // Partial<RankingItem>をRankingItemに変換
            const convertedItems: RankingItem[] = pageItems.map((item): RankingItem => ({
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
            
            // NGフィルタリングを適用
            const { items: filteredItems } = await filterRankingData({ items: convertedItems })
            
            allItems.push(...filteredItems)
            page++
            
            // レート制限対策
            if (page <= maxPages && allItems.length < targetCount) {
              await new Promise(resolve => setTimeout(resolve, 500))
            }
          }
          
          // 300件に切り詰め、ランク番号を振り直す
          const items: RankingData = allItems.slice(0, targetCount).map((item, index) => ({
            ...item,
            rank: index + 1
          }))
        
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
        
        // 「その他」ジャンルのすべての人気タグを両期間で事前生成
        if (genre === 'other' && popularTags && popularTags.length > 0) {
          
          // すべての人気タグを処理（最大15タグ程度を想定）
          for (const tag of popularTags) {
            try {
              // タグ別ランキングを取得
              const { items: tagItems } = await scrapeRankingPage(genre, period, tag, 100, 1)
              
              if (tagItems.length > 0) {
                // NGフィルタリング後に300件確保
                const targetCount = 300
                const allTagItems: RankingItem[] = []
                let tagPage = 1
                const maxTagPages = 5
                
                while (allTagItems.length < targetCount && tagPage <= maxTagPages) {
                  const { items: pageTagItems } = await scrapeRankingPage(genre, period, tag, 100, tagPage)
                  const convertedTagItems: RankingItem[] = pageTagItems.map((item): RankingItem => ({
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
                    registeredAt: item.registeredAt
                  }))
                  
                  const { items: filteredTagItems } = await filterRankingData({ items: convertedTagItems })
                  allTagItems.push(...filteredTagItems)
                  tagPage++
                }
                
                // 300件に切り詰め、ランク番号を振り直す
                const tagRankingItems = allTagItems.slice(0, targetCount).map((item, index) => ({
                  ...item,
                  rank: index + 1
                }))
                
                await kv.set(`ranking-${genre}-${period}-tag-${encodeURIComponent(tag)}`, tagRankingItems, { ex: 3600 })
              }
            } catch (tagError) {
              // console.error(`[Cron] Failed to cache tag ${genre}/${period}/${tag}:`, tagError)
            }
          }
        }
        } catch (error) {
          // console.error(`Failed to fetch ${genre} ${period} ranking:`, error)
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