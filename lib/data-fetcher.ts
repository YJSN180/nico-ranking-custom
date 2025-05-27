import type { RankingData } from '@/types/ranking'

export async function fetchRankingData(): Promise<RankingData> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const response = await fetch(`${baseUrl}/api/ranking`, {
    next: { revalidate: 30 },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch ranking data')
  }

  return response.json()
}