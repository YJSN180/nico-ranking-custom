import type { RankingData } from '@/types/ranking'
import { CACHE_DURATIONS } from './cache-durations'
import { fetchJSON } from './fetch-with-compression'

export async function fetchRankingData(): Promise<RankingData> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  return fetchJSON(`${baseUrl}/api/ranking`, {
    next: { revalidate: CACHE_DURATIONS.API_RANKING }, // 20分に更新
  })
}