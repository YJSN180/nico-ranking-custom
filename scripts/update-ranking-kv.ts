import { kv } from '@vercel/kv'
import { scrapeRankingPage, fetchPopularTags } from '@/lib/scraper'
import type { RankingGenre } from '@/types/ranking-config'

// 更新するジャンルのリスト（R18を除く）
const GENRES_TO_UPDATE: RankingGenre[] = [
  'all',
  'entertainment',
  'radio',
  'music_sound',
  'dance',
  'anime',
  'game',
  'animal',
  'cooking',
  'nature',
  'sports',
  'society_politics_news',
  'technology_craft',
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
      if (process.env.NODE_ENV !== 'test') {
        console.log(`Updating genre: ${genre}`)
      }
      
      // スクレイピングでデータ取得
      const { items } = await scrapeRankingPage(genre, '24h')
      
      // 人気タグを取得（allジャンル以外）
      let popularTags: string[] = []
      if (genre !== 'all') {
        popularTags = await fetchPopularTags(genre)
      }
      
      // KVに保存するデータ
      const dataToStore = {
        items,
        popularTags,
        updatedAt: new Date().toISOString()
      }
      
      // KVに保存（TTL: 1時間）
      await kv.set(`ranking-${genre}`, dataToStore)
      await kv.expire(`ranking-${genre}`, 3600)
      
      updatedGenres.push(genre)
      if (process.env.NODE_ENV !== 'test') {
        console.log(`Successfully updated: ${genre}`)
      }
      
      // ジャンル間に少し遅延を入れる（レート制限対策）
      if (process.env.NODE_ENV !== 'test' && genre !== GENRES_TO_UPDATE[GENRES_TO_UPDATE.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.error(`Failed to update genre ${genre}:`, error)
      }
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

// CLIから直接実行する場合
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  updateRankingData()
    .then(result => {
      console.log('Update completed:', result)
      process.exit(result.success ? 0 : 1)
    })
    .catch(error => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}