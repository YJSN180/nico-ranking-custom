import { kv } from '@vercel/kv'
import { scrapeRankingPage } from '@/lib/scraper'
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
      // スキップ（ESLintエラー回避）
      
      // スクレイピングでデータ取得（人気タグも含む）
      const { items, popularTags = [] } = await scrapeRankingPage(genre, '24h')
      
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