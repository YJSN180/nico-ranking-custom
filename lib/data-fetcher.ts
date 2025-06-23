import type { RankingData } from '@/types/ranking'
import { CACHE_DURATIONS } from './cache-durations'

export async function fetchRankingData(): Promise<RankingData> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const response = await fetch(`${baseUrl}/api/ranking`, {
    next: { revalidate: CACHE_DURATIONS.API_RANKING }, // 20分に更新
  })

  if (!response.ok) {
    throw new Error('Failed to fetch ranking data')
  }

  return response.json()
}