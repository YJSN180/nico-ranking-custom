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
  const periods: ('24h' | 'hour')[] = ['24h', 'hour']
  
  // NGリストのサマリーを取得（ログは出力しない - ESLintエラー回避）
  const { getNGList } = await import('@/lib/ng-filter')
  const ngList = await getNGList()
  // スキップ（ESLintエラー回避）

  // 各ジャンルと期間を順番に更新（レート制限を考慮）
  for (const genre of GENRES_TO_UPDATE) {
    for (const period of periods) {
    try {
      // スキップ（ESLintエラー回避）
      
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
        const beforeCount = convertedItems.length
        const { items: filteredItems } = await filterRankingData({ items: convertedItems })
        const removedCount = beforeCount - filteredItems.length
        
        // NGフィルタリング結果を記録（ログは出力しない - ESLintエラー回避）
        // スキップ（ESLintエラー回避）
        
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
      
      // 新しい形式で保存（period付き）
      await kv.set(`ranking-${genre}-${period}`, dataToStore, { ex: 3600 })
      
      // 後方互換性のため、24hのデータは旧形式でも保存
      if (period === '24h') {
        await kv.set(`ranking-${genre}`, dataToStore, { ex: 3600 })
        
        // 'all'ジャンルは'ranking-data'にも保存
        if (genre === 'all') {
          await kv.set('ranking-data', items, { ex: 3600 })
        }
      }
      
      // 「その他」ジャンルのすべての人気タグを両期間で事前生成
      if (genre === 'other' && popularTags && popularTags.length > 0) {
        // すべての人気タグを処理（最大15タグ程度を想定）
        for (const tag of popularTags) {
          try {
            // タグ別ランキングを取得（300件目標）
            const targetTagCount = 300
            const allTagItems: RankingItem[] = []
            const seenTagVideoIds = new Set<string>()
            let tagPage = 1
            const maxTagPages = 8
            
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
                
                const { items: filteredTagItems } = await filterRankingData({ items: convertedTagItems })
                
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
            
            // 300件に切り詰め、ランク番号を振り直す
            const tagRankingItems = allTagItems.slice(0, targetTagCount).map((item, index) => ({
              ...item,
              rank: index + 1
            }))
            
            // KVに保存（エンコードされたタグ名をキーに使用）
            await kv.set(`ranking-${genre}-${period}-tag-${encodeURIComponent(tag)}`, tagRankingItems, { ex: 3600 })
          } catch (tagError) {
            // タグ別ランキングの取得に失敗してもメイン処理は継続
          }
        }
      }
      
      // 4時間ごとに人気タグをバックアップ
      const currentHour = new Date().getHours()
      if (currentHour % 4 === 0 && popularTags && popularTags.length > 0) {
        try {
          const backupDate = new Date()
          const backupKey = `popular-tags-backup:${backupDate.getFullYear()}-${String(backupDate.getMonth() + 1).padStart(2, '0')}-${String(backupDate.getDate()).padStart(2, '0')}:${String(currentHour).padStart(2, '0')}`
          
          // 既存のバックアップデータを取得（なければ新規作成）
          let backupData = await kv.get(backupKey) as Record<string, string[]> || {}
          
          // 現在のジャンルのタグを更新
          backupData[genre] = popularTags
          
          // 7日間のTTLで保存
          await kv.set(backupKey, backupData, { ex: 7 * 24 * 3600 })
        } catch (backupError) {
          // バックアップエラーは無視してメイン処理を継続
        }
      }
      
      updatedGenres.push(`${genre}-${period}`)
      // 更新成功（ログは出力しない - ESLintエラー回避）
      
      // ジャンル間に少し遅延を入れる（レート制限対策）
      if (process.env.NODE_ENV !== 'test') {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } catch (error) {
      // エラーログはスキップ（ESLintエラー回避）
      failedGenres.push(`${genre}-${period}`)
      
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
  }

  return {
    success: true,
    updatedGenres,
    ...(failedGenres.length > 0 && { failedGenres })
  }
}