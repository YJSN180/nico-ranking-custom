'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getPopularTagsClient } from '@/lib/popular-tags-client'
import { rankingCache } from '@/lib/ranking-cache'
import { requestThrottle } from '@/lib/request-throttle'
import type { RankingData, RankingItem } from '@/types/ranking'
import type { RankingConfig } from '@/types/ranking-config'
import type { NGList } from '@/types/ng-list'
import { applyCustomFilters } from '@/lib/custom-ranking-filter'
import { useDeviceType, getDeviceBasedLimit } from './use-device-type'

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
  
  // デバイスタイプを取得
  const deviceType = useDeviceType()
  
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
      }
    }
  }, [])

  // データフェッチ関数
  const fetchRankingData = useCallback(async (config: RankingConfig) => {

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
        setFullRankingData(cachedData.data)
        setRankingData(cachedData.data)
        if (cachedData.popularTags) {
          setCurrentPopularTags(cachedData.popularTags)
        }
        setLoading(false)
        return
      }

      // APIから取得
      // カスタムランキングの場合はタグランキングとして扱わない
      const isTagRanking = !!config.tag && !config.tag.startsWith('custom:')
      const limit = getDeviceBasedLimit(deviceType, isTagRanking)
      
      // デバッグ情報を出力
      // eslint-disable-next-line no-console
      console.log('[DEBUG] Device type:', deviceType, 'Tag:', config.tag, 'isTagRanking:', isTagRanking, 'Limit:', limit)
      
      // genre='custom'の場合、tagからカスタムランキングIDを取得してbaseGenreを使用
      let actualGenre = config.genre
      let customRankingConditions: any[] = []
      if (config.genre === 'custom') {
        // カスタムランキングIDを取得
        if (config.tag?.startsWith('custom:')) {
          const customId = config.tag.replace('custom:', '')
          const customRankingsStr = localStorage.getItem('custom-rankings')
          // eslint-disable-next-line no-console
          console.log('[DEBUG] Custom ranking ID:', customId)
          // eslint-disable-next-line no-console
          console.log('[DEBUG] LocalStorage data:', customRankingsStr)
          if (customRankingsStr) {
            const customRankings = JSON.parse(customRankingsStr)
            const targetRanking = customRankings.rankings?.find((r: any) => r.id === customId)
            // eslint-disable-next-line no-console
            console.log('[DEBUG] Target ranking:', targetRanking)
            if (targetRanking && targetRanking.baseGenre) {
              actualGenre = targetRanking.baseGenre
              customRankingConditions = targetRanking.conditions || []
              // eslint-disable-next-line no-console
              console.log('[DEBUG] Actual genre:', actualGenre)
              // eslint-disable-next-line no-console
              console.log('[DEBUG] Conditions:', customRankingConditions)
            }
          }
        } else {
          // カスタムランキングが選択されているがタグが指定されていない場合
          // 空データを返してAPIリクエストを防ぐ
          setFullRankingData([])
          setRankingData([])
          setCurrentPopularTags([])
          setLoading(false)
          setError(null)
          return
        }
      }
      
      const baseParams = new URLSearchParams({
        genre: actualGenre,
        period: config.period,
        limit: limit.toString()
      })
      
      if (config.tag && !config.tag.startsWith('custom:')) {
        baseParams.set('tag', config.tag)
      }

      // 開発環境ではプロキシを使用、本番環境では直接APIゲートウェイを使用
      const isDevelopment = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      const apiUrl = isDevelopment 
        ? `/api/ranking?${baseParams.toString()}`
        : `${process.env.NEXT_PUBLIC_API_GATEWAY_URL || ''}/api/ranking?${baseParams.toString()}`
      
      // カスタムランキングAPIリクエストの詳細情報は内部で処理
      
      // リクエスト制限を適用
      await requestThrottle.throttle(apiUrl)

      const response = await fetch(apiUrl, { signal })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: RankingData = await response.json()
      
      // eslint-disable-next-line no-console
      console.log('[DEBUG] API response items count:', data?.items?.length)
      // eslint-disable-next-line no-console
      console.log('[DEBUG] First 3 items:', data?.items?.slice(0, 3).map(item => ({
        title: item.title,
        tags: item.tags,
        tagDetails: item.tagDetails
      })))
      
      if (data && data.items && Array.isArray(data.items)) {
        let itemsToSet = data.items
        
        // カスタムランキングの場合、タグ条件でフィルタリング
        if (config.genre === 'custom' && customRankingConditions.length > 0) {
          // eslint-disable-next-line no-console
          console.log('[DEBUG] Before filtering:', itemsToSet.length)
          itemsToSet = applyCustomFilters(data.items, customRankingConditions)
          // eslint-disable-next-line no-console
          console.log('[DEBUG] After filtering:', itemsToSet.length)
          // eslint-disable-next-line no-console
          console.log('[DEBUG] Filtered items:', itemsToSet.slice(0, 3).map(item => ({
            title: item.title,
            tags: item.tags,
            tagDetails: item.tagDetails
          })))
        }
        
        // フィルタリング後のデータを保存
        setFullRankingData(itemsToSet)
        setRankingData(itemsToSet)
        
        // 人気タグを設定
        if (data.popularTags && Array.isArray(data.popularTags) && data.popularTags.length > 0) {
          setCurrentPopularTags(data.popularTags)
          savePopularTagsToCache(data.popularTags, config.genre, config.period)
        }
        
        // キャッシュに保存（フィルタリング後のデータを保存）
        rankingCache.set(config.genre, config.period, itemsToSet, data.popularTags, config.tag)
      } else {
        // カスタムランキングで空のデータを受信
        setFullRankingData([])
        setRankingData([])
      }
    } catch (err: any) {
      // AbortErrorは無視（前のリクエストがキャンセルされた場合）
      if (err.name === 'AbortError') {
        return
      }
      
      // カスタムランキングAPIエラーは内部で処理
      
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました')
      setFullRankingData([])
      setRankingData([])
    } finally {
      // AbortErrorの場合はローディング状態を維持
      if (!isFallbackInitiatedRef.current && abortControllerRef.current?.signal.aborted !== true) {
        setLoading(false)
      }
    }
  }, [savePopularTagsToCache, deviceType])

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