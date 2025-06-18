'use client'

import { useState, useEffect, useRef } from 'react'
import type { RankingItem } from '@/types/ranking'

interface VideoTagsResponse {
  tags: Record<string, string[]>
  timestamp: string
  count: number
}

// 次の毎時0分までの時間を計算
function getTimeUntilNextHour(): number {
  const now = new Date()
  const nextHour = new Date(now)
  nextHour.setHours(now.getHours() + 1, 0, 0, 0)
  return nextHour.getTime() - now.getTime()
}

export function useVideoTags(
  items: RankingItem[], 
  enabled: boolean = false
) {
  const [tags, setTags] = useState<Record<string, string[]>>({})
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
    
    const fetchTags = async () => {
      // 新しいAbortControllerを作成
      const controller = new AbortController()
      abortControllerRef.current = controller
      
      setIsLoading(true)
      try {
        // 表示中のすべてのアイテムのタグを取得
        const batchSize = 20 // タグ取得は20件ずつ
        const videoIds = items.map(item => item.id)
        
        const allTags: Record<string, string[]> = {}
        
        for (let i = 0; i < videoIds.length; i += batchSize) {
          // キャンセルされたらループを抜ける
          if (controller.signal.aborted) {
            break
          }
          
          const batch = videoIds.slice(i, i + batchSize)
          const response = await fetch(`/api/edge/video-tags?ids=${batch.join(',')}`, {
            signal: controller.signal
          })
          
          if (response.ok) {
            const data: VideoTagsResponse = await response.json()
            Object.assign(allTags, data.tags)
            setLastUpdated(data.timestamp)
          }
          
          // レート制限対策（100ms待機）
          if (i + batchSize < videoIds.length) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }
        
        setTags(allTags)
      } catch (error: any) {
        // AbortErrorは無視
        if (error.name !== 'AbortError') {
          console.error('Failed to fetch video tags:', error)
        }
      } finally {
        setIsLoading(false)
      }
    }
    
    // 初回読み込み
    fetchTags()
    
    // 次の毎時0分に更新をスケジュール
    const timeUntilNextHour = getTimeUntilNextHour()
    const firstTimeout = setTimeout(() => {
      fetchTags()
      
      // その後は1時間ごとに更新
      const interval = setInterval(fetchTags, 60 * 60 * 1000)
      
      // クリーンアップ時にintervalもクリア
      const cleanup = () => {
        clearInterval(interval)
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }
      }
      
      // グローバルなクリーンアップ関数を保存
      ;(window as any).__videoTagsCleanup = cleanup
    }, timeUntilNextHour)
    
    return () => {
      clearTimeout(firstTimeout)
      // グローバルなクリーンアップ関数があれば実行
      const cleanup = (window as any).__videoTagsCleanup
      if (cleanup) {
        cleanup()
        ;(window as any).__videoTagsCleanup = undefined
      }
      // 現在のリクエストをキャンセル
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [items, enabled])
  
  // アイテムとタグ情報をマージ
  const enhancedItems = items.map(item => {
    const videoTags = tags[item.id]
    if (!videoTags || !item.tags) {
      return item
    }
    
    // 既存のタグと新しいタグをマージ（重複を除去）
    const mergedTags = Array.from(new Set([...item.tags, ...videoTags]))
    
    return {
      ...item,
      tags: mergedTags
    }
  })
  
  return {
    items: enhancedItems,
    isLoading,
    lastUpdated,
    hasTags: Object.keys(tags).length > 0
  }
}