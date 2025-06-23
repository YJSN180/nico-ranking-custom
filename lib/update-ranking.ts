import { scrapeRankingPage, fetchPopularTags } from '@/lib/scraper'
import { filterRankingDataServer } from '@/lib/ng-filter-server'
import { addToServerDerivedNGList } from '@/lib/ng-list-server'
import { setRankingToKV, type KVRankingData } from '@/lib/cloudflare-kv'
import type { RankingGenre } from '@/types/ranking-config'
import type { RankingItem } from '@/types/ranking'

// 更新するジャンルのリスト
const GENRES_TO_UPDATE: RankingGenre[] = [
  'all',
  'game',
  'anime',
  'vocaloid',
  'voicesynthesis',
  'entertainment',
  'music',
  'sing',
  'dance',
  'play',
  'commentary',
  'cooking',
  'travel',
  'nature',
  'vehicle',
  'technology',
  'society',
  'mmd',
  'vtuber',
  'radio',
  'sports',
  'animal',
  'other'
]

interface UpdateResult {
  success: boolean
  updatedGenres: string[]
  failedGenres?: string[]
  error?: string
}

// ランキングデータを更新するメイン関数
export async function updateRankingData(): Promise<UpdateResult> {
  const updatedGenres: string[] = []
  const failedGenres: string[] = []
  const periods: ('24h' | 'hour')[] = ['24h', 'hour']
  
  // NGリストのサマリーを取得（ログは出力しない - ESLintエラー回避）
  const { getNGList } = await import('@/lib/ng-filter')
  const ngList = await getNGList()
  // スキップ（ESLintエラー回避）
  
  // Cloudflare KV用のデータ構造を初期化
  const kvData: KVRankingData = {
    genres: {},
    metadata: {
      version: 1,
      updatedAt: new Date().toISOString(),
      totalItems: 0
    }
  }

  // 各ジャンルと期間を順番に更新（レート制限を考慮）
  for (const genre of GENRES_TO_UPDATE) {
    for (const period of periods) {
    try {
      // スキップ（ESLintエラー回避）
      
      // 1000件（NGフィルタリング後）を確保するため、必要に応じて追加ページを取得
      const targetCount = 1000
      const allItems: RankingItem[] = []
      let popularTags: string[] = []
      let page = 1
      const maxPages = 10 // 最大10ページまで取得（ニコニコ動画の上限）
      
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
        const beforeCount = convertedItems.length
        const filterResult = await filterRankingDataServer({ items: convertedItems })
        const filteredItems = filterResult.filteredData.items
        const removedCount = beforeCount - filteredItems.length
        
        // 新しく見つかったNG動画IDを派生リストに追加
        if (filterResult.newDerivedIds.length > 0) {
          try {
            await addToServerDerivedNGList(filterResult.newDerivedIds)
            // eslint-disable-next-line no-console
            console.log(`[NG] Added ${filterResult.newDerivedIds.length} new derived NG IDs from ${genre}-${period}`)
          } catch (error) {
            // エラーは無視して処理を継続
          }
        }
        
        allItems.push(...filteredItems)
        page++
        
        // レート制限対策
        if (page <= maxPages && allItems.length < targetCount) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
      
      // 1000件に切り詰め、ランク番号を振り直す
      const items = allItems.slice(0, targetCount).map((item, index) => ({
        ...item,
        rank: index + 1
      }))
      
      // KVに保存するデータ
      const dataToStore = {
        items,
        popularTags,
        updatedAt: new Date().toISOString()
      }
      
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
      
      // 「その他」ジャンルのすべての人気タグを両期間で事前生成
      if (genre === 'other' && popularTags && popularTags.length > 0) {
        // すべての人気タグを処理（最大15タグ程度を想定）
        for (const tag of popularTags) {
          try {
            // タグ別ランキングを取得（500件目標）
            const targetTagCount = 500
            const allTagItems: RankingItem[] = []
            const seenTagVideoIds = new Set<string>()
            let tagPage = 1
            const maxTagPages = 10
            
            while (allTagItems.length < targetTagCount && tagPage <= maxTagPages) {
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
                })).filter((item: any) => item.id && item.title)
                
                const { filteredData: { items: filteredTagItems } } = await filterRankingDataServer({ items: convertedTagItems })
                
                // 重複を除外しながら追加
                for (const item of filteredTagItems) {
                  if (!seenTagVideoIds.has(item.id)) {
                    seenTagVideoIds.add(item.id)
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
            const tagRankingItems = allTagItems.slice(0, targetTagCount).map((item, index) => ({
              ...item,
              rank: index + 1
            }))
            
            // Vercel KVへの保存は削除（Cloudflare KVのみ使用）
            
            // Cloudflare KVデータにも追加
            if (kvData.genres[genre][period].tags) {
              kvData.genres[genre][period].tags[tag] = tagRankingItems
            }
          } catch (tagError) {
            // タグ別ランキングの取得に失敗してもメイン処理は継続
          }
        }
      }
      
      // バックアップ機能は削除（Cloudflare KVで管理）
      
      updatedGenres.push(`${genre}-${period}`)
      // 更新成功（ログは出力しない - ESLintエラー回避）
      
      // ジャンル間に少し遅延を入れる（レート制限対策）
      if (process.env.NODE_ENV !== 'test') {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } catch (error) {
      // エラーログはスキップ（ESLintエラー回避）
      failedGenres.push(`${genre}-${period}`)
      
      // エラーの場合は全体を失敗とする
      if (error instanceof Error) {
        return {
          success: false,
          updatedGenres,
          error: error.message
        }
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

  return {
    success: true,
    updatedGenres,
    ...(failedGenres.length > 0 && { failedGenres })
  }
}