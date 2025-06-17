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

// Cache duration for video stats (2 minutes)
const CACHE_DURATION = 2 * 60 * 1000

interface CachedStats {
  stats: RealtimeStatsResponse['stats']
  timestamp: number
  videoIds: string[]
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
  
  // Pending requests map to prevent duplicate requests
  const pendingRequestsRef = useRef<Map<string, Promise<any>>>(new Map())
  
  // Get cached stats from sessionStorage
  const getCachedStats = (videoIds: string[]): CachedStats | null => {
    try {
      const cacheKey = `video-stats-${videoIds.slice(0, 10).join('-')}`
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        const data: CachedStats = JSON.parse(cached)
        // Check if cache is still valid
        if (Date.now() - data.timestamp < CACHE_DURATION) {
          return data
        }
      }
    } catch {
      // Ignore storage errors
    }
    return null
  }
  
  // Save stats to sessionStorage
  const setCachedStats = (videoIds: string[], statsData: RealtimeStatsResponse['stats']) => {
    try {
      const cacheKey = `video-stats-${videoIds.slice(0, 10).join('-')}`
      const data: CachedStats = {
        stats: statsData,
        timestamp: Date.now(),
        videoIds: videoIds
      }
      sessionStorage.setItem(cacheKey, JSON.stringify(data))
    } catch {
      // Ignore storage errors
    }
  }
  
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
        
        // Check cache first
        const cached = getCachedStats(videoIds)
        if (cached && cached.videoIds.length === videoIds.length) {
          setStats(cached.stats)
          setLastUpdated(new Date(cached.timestamp).toISOString())
          setIsLoading(false)
          return
        }
        
        const allStats: RealtimeStatsResponse['stats'] = {}
        
        for (let i = 0; i < videoIds.length; i += batchSize) {
          // キャンセルされたらループを抜ける
          if (controller.signal.aborted) {
            break
          }
          
          const batch = videoIds.slice(i, i + batchSize)
          const batchKey = batch.join(',')
          
          // Check if request is already pending
          let responsePromise = pendingRequestsRef.current.get(batchKey)
          
          if (!responsePromise) {
            // Create new request
            responsePromise = fetch(`/api/video-stats?ids=${batchKey}`, {
              signal: controller.signal
            })
            pendingRequestsRef.current.set(batchKey, responsePromise)
          }
          
          try {
            const response = await responsePromise
            if (response.ok) {
              const data: RealtimeStatsResponse = await response.json()
              Object.assign(allStats, data.stats)
              setLastUpdated(data.timestamp)
            }
          } finally {
            // Clean up pending request
            pendingRequestsRef.current.delete(batchKey)
          }
          
          // レート制限対策（50ms待機 - 大量更新時の負荷分散）
          if (i + batchSize < videoIds.length) {
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        }
        
        setStats(allStats)
        // Cache the results
        setCachedStats(videoIds, allStats)
      } catch (error: any) {
        // AbortErrorは無視
        if (error.name !== 'AbortError') {
          // Failed to fetch realtime stats - error is ignored unless it's an AbortError
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