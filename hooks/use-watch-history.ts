'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { DBManager } from '@/lib/storage/db-manager'
import { WatchHistoryManager } from '@/lib/storage/watch-history'
import type { WatchHistoryEntry } from '@/lib/storage/types'

export interface UseWatchHistoryResult {
  history: WatchHistoryEntry[]
  isLoading: boolean
  selectedItems: Set<string>
  stats: {
    totalCount: number
    oldestWatchedAt: number | null
    newestWatchedAt: number | null
  } | null
  addToHistory: (video: {
    id: string
    title: string
    thumbURL: string
    views?: number
    comments?: number
    mylists?: number
    likes?: number
    authorId?: string
    authorName?: string
    authorIcon?: string
    registeredAt?: string
  }) => Promise<void>
  loadHistory: (limit?: number, offset?: number) => Promise<void>
  searchHistory: (query: string) => Promise<void>
  removeSelected: () => Promise<void>
  clearAllHistory: () => Promise<void>
  toggleSelection: (videoId: string) => void
  toggleSelectAll: () => void
  loadStats: () => Promise<void>
}

export function useWatchHistory(): UseWatchHistoryResult {
  const [history, setHistory] = useState<WatchHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [stats, setStats] = useState<UseWatchHistoryResult['stats']>(null)
  
  const dbManagerRef = useRef<DBManager | null>(null)
  const watchHistoryManagerRef = useRef<WatchHistoryManager | null>(null)
  
  // 初期化
  useEffect(() => {
    let mounted = true
    
    const init = async () => {
      // Wait a bit to ensure hydration is complete
      await new Promise(resolve => setTimeout(resolve, 100))
      
      if (!mounted) return
      
      try {
        if (!dbManagerRef.current) {
          dbManagerRef.current = new DBManager()
          await dbManagerRef.current.init()
          watchHistoryManagerRef.current = new WatchHistoryManager(dbManagerRef.current)
        }
        
        // 初期履歴を読み込む
        await loadHistoryInternal()
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to initialize watch history:', error)
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }
    
    init()
    
    return () => {
      mounted = false
    }
  }, [])
  
  const loadHistoryInternal = async (limit?: number, offset?: number) => {
    if (!watchHistoryManagerRef.current) return
    
    try {
      const entries = await watchHistoryManagerRef.current.getHistory(limit, offset)
      setHistory(entries)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load history:', error)
    }
  }
  
  const addToHistory = useCallback(async (video: Parameters<UseWatchHistoryResult['addToHistory']>[0]) => {
    if (!watchHistoryManagerRef.current) return
    
    try {
      await watchHistoryManagerRef.current.addToHistory(video)
      // 履歴を再読み込み
      await loadHistoryInternal()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add to history:', error)
    }
  }, [])
  
  const loadHistory = useCallback(async (limit?: number, offset?: number) => {
    await loadHistoryInternal(limit, offset)
  }, [])
  
  const searchHistory = useCallback(async (query: string) => {
    if (!watchHistoryManagerRef.current) return
    
    try {
      const results = await watchHistoryManagerRef.current.searchHistory(query)
      setHistory(results)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to search history:', error)
    }
  }, [])
  
  const removeSelected = useCallback(async () => {
    if (!watchHistoryManagerRef.current || selectedItems.size === 0) return
    
    try {
      const videoIds = Array.from(selectedItems)
      await watchHistoryManagerRef.current.removeFromHistory(videoIds)
      setSelectedItems(new Set())
      await loadHistoryInternal()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to remove selected items:', error)
    }
  }, [selectedItems])
  
  const clearAllHistory = useCallback(async () => {
    if (!watchHistoryManagerRef.current) return
    
    if (!confirm('すべての視聴履歴を削除してもよろしいですか？\nこの操作は取り消せません。')) {
      return
    }
    
    try {
      await watchHistoryManagerRef.current.clearHistory()
      setHistory([])
      setSelectedItems(new Set())
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to clear history:', error)
    }
  }, [])
  
  const toggleSelection = useCallback((videoId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(videoId)) {
        newSet.delete(videoId)
      } else {
        newSet.add(videoId)
      }
      return newSet
    })
  }, [])
  
  const toggleSelectAll = useCallback(() => {
    if (selectedItems.size === history.length) {
      // すべて解除
      setSelectedItems(new Set())
    } else {
      // すべて選択
      setSelectedItems(new Set(history.map(item => item.videoId)))
    }
  }, [history, selectedItems.size])
  
  const loadStats = useCallback(async () => {
    if (!watchHistoryManagerRef.current) return
    
    try {
      const statsData = await watchHistoryManagerRef.current.getHistoryStats()
      setStats(statsData)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load stats:', error)
    }
  }, [])
  
  return {
    history,
    isLoading,
    selectedItems,
    stats,
    addToHistory,
    loadHistory,
    searchHistory,
    removeSelected,
    clearAllHistory,
    toggleSelection,
    toggleSelectAll,
    loadStats
  }
}