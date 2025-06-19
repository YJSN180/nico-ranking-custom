import type { DerivativeNGData } from '@/types/ranking'
import { getRankingFromKV } from './cloudflare-kv'

/**
 * KVからランキングデータに埋め込まれた派生NGリストを取得
 */
export async function getDerivativeNGListFromKV(): Promise<DerivativeNGData | null> {
  try {
    const rankingData = await getRankingFromKV()
    return rankingData?.derivativeNGData || null
  } catch (error) {
    console.error('Failed to get derivative NG list from KV:', error)
    return null
  }
}

/**
 * 派生NGリストの統計情報を取得
 */
export async function getDerivativeNGStats(): Promise<{
  totalBlocked: number
  lastUpdated: string | null
  totalVideosProcessed: number
} | null> {
  try {
    const derivativeData = await getDerivativeNGListFromKV()
    if (!derivativeData) {
      return null
    }
    
    return {
      totalBlocked: derivativeData.statsSnapshot.totalBlocked,
      lastUpdated: derivativeData.statsSnapshot.lastUpdated,
      totalVideosProcessed: derivativeData.statsSnapshot.totalVideosProcessed
    }
  } catch (error) {
    console.error('Failed to get derivative NG stats:', error)
    return null
  }
}

/**
 * 特定の動画IDが派生NGリストに含まれているかチェック
 */
export async function isVideoInDerivativeNGList(videoId: string): Promise<boolean> {
  try {
    const derivativeData = await getDerivativeNGListFromKV()
    if (!derivativeData) {
      return false
    }
    
    return derivativeData.blockedVideoIds.includes(videoId)
  } catch (error) {
    console.error('Failed to check video in derivative NG list:', error)
    return false
  }
}