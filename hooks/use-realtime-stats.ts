'use client'

import { useState, useEffect } from 'react'
import type { RankingItem } from '@/types/ranking'

interface RealtimeStatsResponse {
  stats: Record<string, {
    viewCounter?: number
    commentCounter?: number
    mylistCounter?: number
    likeCounter?: number
  }>
  timestamp: string
  count: number
}

export function useRealtimeStats(
  items: RankingItem[], 
  enabled: boolean = false,
  updateInterval: number = 60000 // 1分ごと（デフォルト）
) {
  const [stats, setStats] = useState<RealtimeStatsResponse['stats']>({})
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  
  useEffect(() => {
    if (!enabled || items.length === 0) {
      return
    }
    
    const fetchStats = async () => {
      setIsLoading(true)
      try {
        // バッチで最大10個ずつ取得（API制限のため）
        const batchSize = 10
        const videoIds = items.map(item => item.id) // 全動画を対象
        
        const allStats: RealtimeStatsResponse['stats'] = {}
        
        for (let i = 0; i < videoIds.length; i += batchSize) {
          const batch = videoIds.slice(i, i + batchSize)
          const response = await fetch(`/api/video-stats?ids=${batch.join(',')}`)
          
          if (response.ok) {
            const data: RealtimeStatsResponse = await response.json()
            Object.assign(allStats, data.stats)
            setLastUpdated(data.timestamp)
          }
          
          // レート制限対策（100ms待機）
          if (i + batchSize < videoIds.length) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }
        
        setStats(allStats)
      } catch (error) {
        console.error('Failed to fetch realtime stats:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    // 初回読み込み
    fetchStats()
    
    // 定期更新
    const interval = setInterval(fetchStats, updateInterval)
    
    return () => clearInterval(interval)
  }, [items, enabled, updateInterval])
  
  // アイテムとリアルタイム統計情報をマージ
  const enhancedItems = items.map(item => {
    const realtimeData = stats[item.id]
    if (!realtimeData) {
      return item
    }
    
    // リアルタイムデータで上書き
    return {
      ...item,
      views: realtimeData.viewCounter ?? item.views,
      comments: realtimeData.commentCounter ?? item.comments,
      mylists: realtimeData.mylistCounter ?? item.mylists,
      likes: realtimeData.likeCounter ?? item.likes,
    }
  })
  
  return {
    items: enhancedItems,
    isLoading,
    lastUpdated,
    hasRealtimeData: Object.keys(stats).length > 0
  }
}