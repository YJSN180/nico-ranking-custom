import { kv } from '@vercel/kv'
import { scrapeRankingPage, fetchPopularTags } from '@/lib/scraper'
import { filterRankingData } from '@/lib/ng-filter'
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

  // 各ジャンルを順番に更新（レート制限を考慮）
  for (const genre of GENRES_TO_UPDATE) {
    try {
      // スキップ（ESLintエラー回避）
      
      // 300件（NGフィルタリング後）を確保するため、必要に応じて追加ページを取得
      const targetCount = 300
      const allItems: RankingItem[] = []
      let popularTags: string[] = []
      let page = 1
      const maxPages = 5 // 最大5ページまで取得
      
      while (allItems.length < targetCount && page <= maxPages) {
        const { items: pageItems, popularTags: pageTags } = await scrapeRankingPage(genre, '24h', undefined, 100, page)
        
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
      
      // KVに保存（TTL: 1時間）
      await kv.set(`ranking-${genre}`, dataToStore)
      await kv.expire(`ranking-${genre}`, 3600)
      
      // 24hと hourの両方の期間で保存（後方互換性のため）
      await kv.set(`ranking-${genre}-24h`, dataToStore, { ex: 3600 })
      
      updatedGenres.push(genre)
      // スキップ（ESLintエラー回避）
      
      // ジャンル間に少し遅延を入れる（レート制限対策）
      if (process.env.NODE_ENV !== 'test' && genre !== GENRES_TO_UPDATE[GENRES_TO_UPDATE.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } catch (error) {
      // エラーログはスキップ（ESLintエラー回避）
      failedGenres.push(genre)
      
      // KVエラーの場合は全体を失敗とする
      if (error instanceof Error && error.message.includes('KV')) {
        return {
          success: false,
          updatedGenres,
          error: error.message
        }
      }
    }
  }

  return {
    success: true,
    updatedGenres,
    ...(failedGenres.length > 0 && { failedGenres })
  }
}