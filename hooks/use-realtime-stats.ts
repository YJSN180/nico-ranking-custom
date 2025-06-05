'use client'

import { useState, useEffect, useRef } from 'react'
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
  
  // AbortControllerのref
  const abortControllerRef = useRef<AbortController | null>(null)
  
  useEffect(() => {
    if (!enabled || items.length === 0) {
      return
    }
    
    // 前回のリクエストをキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    const fetchStats = async () => {
      // 新しいAbortControllerを作成
      const controller = new AbortController()
      abortControllerRef.current = controller
      
      setIsLoading(true)
      try {
        // 表示中のアイテムのみ統計を取得（最大50件）
        const visibleItems = items.slice(0, 50)
        const batchSize = 10
        const videoIds = visibleItems.map(item => item.id)
        
        const allStats: RealtimeStatsResponse['stats'] = {}
        
        for (let i = 0; i < videoIds.length; i += batchSize) {
          // キャンセルされたらループを抜ける
          if (controller.signal.aborted) {
            break
          }
          
          const batch = videoIds.slice(i, i + batchSize)
          const response = await fetch(`/api/video-stats?ids=${batch.join(',')}`, {
            signal: controller.signal
          })
          
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
      } catch (error: any) {
        // AbortErrorは無視
        if (error.name !== 'AbortError') {
          console.error('Failed to fetch realtime stats:', error)
        }
      } finally {
        setIsLoading(false)
      }
    }
    
    // 初回読み込み
    fetchStats()
    
    // 定期更新
    const interval = setInterval(fetchStats, updateInterval)
    
    return () => {
      clearInterval(interval)
      // クリーンアップ時にリクエストをキャンセル
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
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