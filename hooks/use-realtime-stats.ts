'use client'

import { useState, useEffect, useRef } from 'react'
import { requestThrottle } from '@/lib/request-throttle'
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
  updateInterval: number = 120000 // 2分ごと（デフォルト）
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
        // 表示中のすべてのアイテムの統計を取得
        const batchSize = 10
        const videoIds = items.map(item => item.id)
        
        const allStats: RealtimeStatsResponse['stats'] = {}
        
        for (let i = 0; i < videoIds.length; i += batchSize) {
          // キャンセルされたらループを抜ける
          if (controller.signal.aborted) {
            break
          }
          
          const batch = videoIds.slice(i, i + batchSize)
          const apiUrl = `/api/edge/video-stats?ids=${batch.join(',')}`
          
          // Apply client-side rate limiting
          await requestThrottle.throttle(apiUrl)
          
          const response = await fetch(apiUrl, {
            signal: controller.signal
          })
          
          if (response.ok) {
            const data: RealtimeStatsResponse = await response.json()
            Object.assign(allStats, data.stats)
            setLastUpdated(data.timestamp)
          }
          
          // レート制限対策（50ms待機 - 大量更新時の負荷分散）
          if (i + batchSize < videoIds.length) {
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        }
        
        setStats(allStats)
      } catch (error: any) {
        // AbortErrorは無視
        if (error.name !== 'AbortError') {
          // Failed to fetch realtime stats - error is ignored unless it's an AbortError
        }
      } finally {
        setIsLoading(false)
      }
    }
    
    // Page Visibility API用の変数
    let interval: NodeJS.Timeout | null = null
    
    const startUpdates = () => {
      // 既に動作中の場合は何もしない
      if (interval) return
      
      // 可視状態の時のみ更新を開始
      if (document.visibilityState === 'visible') {
        fetchStats() // 即座に更新
        interval = setInterval(fetchStats, updateInterval)
      }
    }
    
    const stopUpdates = () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }
    
    // 可視性の変更を監視
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // タブがアクティブになったら更新を再開
        startUpdates()
      } else {
        // タブが非アクティブになったら更新を停止
        stopUpdates()
      }
    }
    
    // イベントリスナーを登録
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // 初期状態の確認と開始
    if (document.visibilityState === 'visible') {
      startUpdates()
    }
    
    return () => {
      stopUpdates()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
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