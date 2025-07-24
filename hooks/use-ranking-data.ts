'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getPopularTagsClient } from '@/lib/popular-tags-client'
import { rankingCache } from '@/lib/ranking-cache'
import { requestThrottle } from '@/lib/request-throttle'
import type { RankingData, RankingItem } from '@/types/ranking'
import type { RankingConfig } from '@/types/ranking-config'
import type { NGList } from '@/types/ng-list'

interface UseRankingDataProps {
  initialData: { items: RankingItem[], popularTags?: string[] }
  ngList: NGList
  ngListVersion: string
}

interface UseRankingDataReturn {
  rankingData: RankingItem[]
  fullRankingData: RankingItem[]
  currentPopularTags: string[]
  loading: boolean
  error: string | null
  fetchRankingData: (config: RankingConfig) => Promise<void>
  setCurrentPopularTags: (tags: string[]) => void
  setRankingData: (data: RankingItem[]) => void
  setFullRankingData: (data: RankingItem[]) => void
  setError: (error: string | null) => void
  abortControllerRef: React.MutableRefObject<AbortController | null>
  tagsAbortControllerRef: React.MutableRefObject<AbortController | null>
  isFallbackInitiatedRef: React.MutableRefObject<boolean>
}

const DISPLAY_LIMITS = {
  TAG: 300,      // タグ別ランキングは全300件取得
  GENRE: 500,    // ジャンル別ランキングは500件取得
}

export function useRankingData({
  initialData,
  ngList,
  ngListVersion
}: UseRankingDataProps): UseRankingDataReturn {
  const [rankingData, setRankingData] = useState<RankingItem[]>(initialData?.items || [])
  const [fullRankingData, setFullRankingData] = useState<RankingItem[]>(() => {
    // 初期データをrank順でソートして設定
    const initialArray = (initialData?.items && Array.isArray(initialData.items)) ? initialData.items : []
    return [...initialArray].sort((a, b) => a.rank - b.rank)
  })
  const [currentPopularTags, setCurrentPopularTags] = useState<string[]>(initialData?.popularTags || [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // リクエストキャンセル用のAbortController
  const abortControllerRef = useRef<AbortController | null>(null)
  const tagsAbortControllerRef = useRef<AbortController | null>(null)
  const isFallbackInitiatedRef = useRef(false)

  // 人気タグのキャッシュ保存用
  const savePopularTagsToCache = useCallback((tags: string[], genre: string, period: string) => {
    if (tags && tags.length > 0) {
      const storageKey = `popular-tags-${genre}-${period}`
      try {
        localStorage.setItem(storageKey, JSON.stringify(tags))
      } catch (e) {
        console.warn('Failed to save popular tags to localStorage:', e)
      }
    }
  }, [])

  // データフェッチ関数
  const fetchRankingData = useCallback(async (config: RankingConfig) => {
    // カスタムジャンルの場合はAPIリクエストをスキップ
    if (config.genre === 'custom') {
      setLoading(false)
      setError(null)
      setFullRankingData([])
      setRankingData([])
      setCurrentPopularTags([])
      return
    }

    // 前のリクエストをキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    if (tagsAbortControllerRef.current) {
      tagsAbortControllerRef.current.abort()
    }

    // フォールバック処理中フラグをリセット
    isFallbackInitiatedRef.current = false

    // AbortControllerを新規作成
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setLoading(true)
    setError(null)

    try {
      // キャッシュから取得を試行
      const cacheKey = `${config.genre}-${config.period}${config.tag ? `-tag-${config.tag}` : ''}`
      const cachedData = rankingCache.get(config.genre, config.period, config.tag)
      
      if (cachedData) {
        console.log(`Using cached data for ${cacheKey}`)
        setFullRankingData(cachedData.data)
        setRankingData(cachedData.data)
        if (cachedData.popularTags) {
          setCurrentPopularTags(cachedData.popularTags)
        }
        setLoading(false)
        return
      }

      // APIから取得
      const limit = config.tag ? DISPLAY_LIMITS.TAG : DISPLAY_LIMITS.GENRE
      const baseParams = new URLSearchParams({
        genre: config.genre,
        period: config.period,
        limit: limit.toString()
      })
      
      if (config.tag) {
        baseParams.set('tag', config.tag)
      }

      const apiUrl = `${process.env.NEXT_PUBLIC_API_GATEWAY_URL || ''}/api/ranking?${baseParams.toString()}`
      
      // リクエスト制限を適用
      await requestThrottle.throttle(apiUrl)

      const response = await fetch(apiUrl, { signal })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: RankingData = await response.json()
      
      if (data && data.items && Array.isArray(data.items)) {
        // フィルタリングせずに生データを保存
        setFullRankingData(data.items)
        setRankingData(data.items)
        
        // 人気タグを設定
        if (data.popularTags && Array.isArray(data.popularTags) && data.popularTags.length > 0) {
          setCurrentPopularTags(data.popularTags)
          savePopularTagsToCache(data.popularTags, config.genre, config.period)
        }
        
        // キャッシュに保存（生データを保存）
        rankingCache.set(config.genre, config.period, data.items, data.popularTags, config.tag)
      } else {
        setFullRankingData([])
        setRankingData([])
      }
    } catch (err: any) {
      // AbortErrorは無視（前のリクエストがキャンセルされた場合）
      if (err.name === 'AbortError') {
        return
      }
      
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました')
      setFullRankingData([])
      setRankingData([])
    } finally {
      // AbortErrorの場合はローディング状態を維持
      if (!isFallbackInitiatedRef.current && abortControllerRef.current?.signal.aborted !== true) {
        setLoading(false)
      }
    }
  }, [savePopularTagsToCache])

  // NGリストのフィルタリングはclient-page.tsx側で行うため、
  // ここでは生データをそのまま保持する
  useEffect(() => {
    setRankingData(fullRankingData)
  }, [fullRankingData])

  return {
    rankingData,
    fullRankingData,
    currentPopularTags,
    loading,
    error,
    fetchRankingData,
    setCurrentPopularTags,
    setRankingData,
    setFullRankingData,
    setError,
    abortControllerRef,
    tagsAbortControllerRef,
    isFallbackInitiatedRef
  }
}