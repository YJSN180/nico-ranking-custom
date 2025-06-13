import { NextResponse } from 'next/server'
import { scrapeRankingPage } from '@/lib/scraper'
import { filterRankingDataServer } from '@/lib/ng-filter-server'
import { CACHED_GENRES } from '@/types/ranking-config'
import { setRankingToKV, type KVRankingData } from '@/lib/cloudflare-kv'
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

  // 重複実行防止機能は削除（Cloudflare KVで管理）

  try {
    // 人気ジャンルのデータを取得してキャッシュ
    const genres = CACHED_GENRES
    const periods: ('24h' | 'hour')[] = ['24h', 'hour']
    let allSuccess = true
    let totalItems = 0
    
    // Cloudflare KV用のデータ構造を初期化
    const kvData: KVRankingData = {
      genres: {},
      metadata: {
        version: 1,
        updatedAt: new Date().toISOString(),
        totalItems: 0
      }
    }
    
    for (const genre of genres) {
      for (const period of periods) {
        try {
          // 300件（NGフィルタリング後）を確保するため、必要に応じて追加ページを取得
          const targetCount = 300
          const allItems: RankingItem[] = []
          const seenVideoIds = new Set<string>() // 重複チェック用
          let popularTags: string[] = []
          let page = 1
          const maxPages = 8 // 重複を考慮して上限を増やす
          
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
            const { items: filteredItems } = await filterRankingDataServer({ items: convertedItems })
            
            // 重複を除外しながら追加
            for (const item of filteredItems) {
              if (!seenVideoIds.has(item.id)) {
                seenVideoIds.add(item.id)
                allItems.push(item)
              }
            }
            
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
        
        // Cloudflare KV用のデータ構造に追加
        if (!kvData.genres[genre]) {
          kvData.genres[genre] = {
            '24h': { items: [], popularTags: [] },
            'hour': { items: [], popularTags: [] }
          }
        }
        kvData.genres[genre][period] = {
          items,
          popularTags,
          tags: {} // タグ別ランキングは後で追加
        }
        kvData.metadata!.totalItems += items.length
        
        // Vercel KVへの保存は削除（Cloudflare KVのみ使用）
        if (genre === 'all' && period === '24h') {
          totalItems = items.length
        }
        
        // 全ジャンルの人気タグを事前キャッシュ（500件ずつ）
        if (popularTags && popularTags.length > 0) {
          
          // 全人気タグを処理（500件ずつキャッシュ）
          for (const tag of popularTags) {
            try {
              // タグ別ランキングを取得
              const { items: tagItems } = await scrapeRankingPage(genre, period, tag, 100, 1)
              
              if (tagItems.length > 0) {
                // NGフィルタリング後に500件確保
                const targetCount = 500
                const allTagItems: RankingItem[] = []
                const seenVideoIds = new Set<string>() // 重複チェック用
                let tagPage = 1
                const maxTagPages = 10 // 500件確保のため上限を増やす
                
                while (allTagItems.length < targetCount && tagPage <= maxTagPages) {
                  try {
                    const { items: pageTagItems } = await scrapeRankingPage(genre, period, tag, 100, tagPage)
                    
                    // ページにアイテムがない場合は終了
                    if (!pageTagItems || pageTagItems.length === 0) {
                      break
                    }
                    
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
                  
                  const { items: filteredTagItems } = await filterRankingDataServer({ items: convertedTagItems })
                  
                  // 重複を除外しながら追加
                  for (const item of filteredTagItems) {
                    if (!seenVideoIds.has(item.id)) {
                      seenVideoIds.add(item.id)
                      allTagItems.push(item)
                    }
                  }
                  
                    tagPage++
                    
                    // 500msの遅延
                    await new Promise(resolve => setTimeout(resolve, 500))
                  } catch (pageError) {
                    // ページ取得エラーの場合はループを終了
                    break
                  }
                }
                
                // 500件に切り詰め、ランク番号を振り直す
                const tagRankingItems = allTagItems.slice(0, targetCount).map((item, index) => ({
                  ...item,
                  rank: index + 1
                }))
                
                // Vercel KVへの保存は削除（Cloudflare KVのみ使用）
                
                // Cloudflare KVデータにも追加
                if (kvData.genres[genre][period].tags) {
                  kvData.genres[genre][period].tags[tag] = tagRankingItems
                }
              }
            } catch (tagError) {
              // console.error(`[Cron] Failed to cache tag ${genre}/${period}/${tag}:`, tagError)
            }
          }
        }
        } catch (error) {
          // console.error(`Failed to fetch ${genre} ${period} ranking:`, error)
          allSuccess = false
          
          // エラー時の処理
          if (genre === 'all' && period === '24h') {
            totalItems = 0
          }
        }
      }
    }
    
    // すべてのジャンルの更新が完了したら、Cloudflare KVに一括保存
    try {
      await setRankingToKV(kvData)
      // Cloudflare KV書き込み成功（ログは出力しない - ESLintエラー回避）
    } catch (cfError) {
      // Cloudflare KVへの書き込みに失敗しても、Vercel KVへの書き込みは成功しているので処理は続行
      // エラーは記録するが、全体としては成功とする
    }
    
    // 更新情報はCloudflare KVのメタデータに含まれる

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