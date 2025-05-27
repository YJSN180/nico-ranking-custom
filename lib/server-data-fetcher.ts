import type { RankingData } from '@/types/ranking'
import { kv } from '@vercel/kv'

export async function fetchRankingDataServer(): Promise<RankingData> {
  const data = await kv.get<RankingData>('ranking-data')
  
  if (!data) {
    return []
  }
  
  // Handle both string and object responses from KV
  if (typeof data === 'object' && Array.isArray(data)) {
    return data as RankingData
  } else if (typeof data === 'string') {
    return JSON.parse(data)
  }
  
  return []
}