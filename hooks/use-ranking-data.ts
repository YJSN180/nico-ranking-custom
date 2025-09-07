'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getPopularTagsClient } from '@/lib/popular-tags-client'
import { rankingCache } from '@/lib/ranking-cache'
import type { RankingData, RankingItem } from '@/types/ranking'
import type { RankingConfig, RankingGenre } from '@/types/ranking-config'
import type { NGList } from '@/types/ng-list'
import { applyCustomFilters } from '@/lib/custom-ranking-filter'
import { useDeviceType, getDeviceBasedLimit } from './use-device-type'
import { serverLog } from '@/lib/server-log'

interface UseRankingDataProps {
  initialData: { items: RankingItem[], popularTags?: string[] }
  ngList: NGList
  ngListVersion: string
  customRankings?: any[]
  newlyCreatedRankings?: Map<string, {
    id: string
    title: string
    conditions: any[]
    baseGenre: RankingGenre
  }>
}

interface UseRankingDataReturn {
  rankingData: RankingItem[]
  fullRankingData: RankingItem[]
  currentPopularTags: string[]
  loading: boolean
  error: string | null
  isRetrying: boolean
  retryCount: number
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
  ngListVersion,
  customRankings = [],
  newlyCreatedRankings = new Map()
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
  const [isRetrying, setIsRetrying] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  
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
    setRetryCount(0)
    setIsRetrying(false)

    try {
      // カスタムランキングの場合、ベースジャンルを特定
      let cacheGenre = config.genre
      let isCustomRanking = false
      let customRankingConditions: any[] = []
      
      if (config.genre === 'custom' && config.tag?.startsWith('custom:')) {
        isCustomRanking = true
        const customId = config.tag.replace('custom:', '')
        
        console.log('[DEBUG] Looking for custom ranking:', {
          customId,
          hasNewlyCreated: newlyCreatedRankings.has(customId),
          newlyCreatedCount: newlyCreatedRankings.size,
          customRankingsCount: customRankings.length,
          timestamp: new Date().toISOString()
        })
        
        const targetRanking = customRankings.find((r: any) => r.id === customId) || 
                              newlyCreatedRankings.get(customId) || null
        
        if (targetRanking?.baseGenre) {
          cacheGenre = targetRanking.baseGenre
          customRankingConditions = targetRanking.conditions || []
        } else {
          // targetRankingが見つからない場合は早期リターン（404エラーを防ぐ）
          serverLog.warn('Custom ranking not found, returning empty data to prevent 404', {
            customId,
            customRankingsCount: customRankings.length,
            hasNewlyCreated: newlyCreatedRankings.size > 0,
            newlyCreatedIds: Array.from(newlyCreatedRankings.keys())
          })
          setFullRankingData([])
          setRankingData([])
          setCurrentPopularTags([])
          setLoading(false)
          setError(null)
          return
        }
      }
      
      // キャッシュから取得を試行（カスタムランキングの場合はベースジャンルのキャッシュを使用）
      if (cacheGenre !== 'custom') {
        // タグランキングの場合はタグも含めてキャッシュキーを生成
        const cacheTag = config.tag && !config.tag.startsWith('custom:') ? config.tag : undefined
        const cachedData = rankingCache.get(cacheGenre, config.period, cacheTag)
        
        if (cachedData) {
          // キャッシュヒット時のログ
          serverLog.info('Cache hit for ranking data', {
            genre: cacheGenre,
            period: config.period,
            tag: cacheTag || 'none',
            itemCount: cachedData.data?.length || 0
          })
          let itemsToSet = cachedData.data
          
          // カスタムランキングの場合はフィルタリングを適用
          if (isCustomRanking && customRankingConditions.length > 0) {
            itemsToSet = applyCustomFilters(cachedData.data, customRankingConditions)
          }
          
          setFullRankingData(itemsToSet)
          setRankingData(itemsToSet)
          if (cachedData.popularTags && !isCustomRanking) {
            setCurrentPopularTags(cachedData.popularTags)
          }
          setLoading(false)
          return
        } else {
          // キャッシュミス時のログ
          serverLog.info('Cache miss for ranking data', {
            genre: cacheGenre,
            period: config.period,
            tag: cacheTag || 'none',
            reason: 'No cached data found'
          })
        }
      }

      // APIから取得
      // カスタムランキングの場合はタグランキングとして扱わない
      const isTagRanking = !!config.tag && !config.tag.startsWith('custom:')
      const limit = getDeviceBasedLimit(deviceType, isTagRanking)
      
      // デバッグ情報をVercelログに出力
      serverLog.info('Device type and API request info', {
        deviceType,
        tag: config.tag,
        isTagRanking,
        limit,
        genre: config.genre,
        period: config.period
      })
      
      // actualGenreの設定（カスタムランキングの場合は既に処理済みのcacheGenreを使用）
      let actualGenre = isCustomRanking ? cacheGenre : config.genre
      
      // カスタムランキングが選択されているがタグが指定されていない場合
      if (config.genre === 'custom' && !config.tag?.startsWith('custom:')) {
        // 空データを返してAPIリクエストを防ぐ
        serverLog.info('Custom genre without custom tag - returning empty data', {
          genre: config.genre,
          tag: config.tag,
          hasCustomRankings: customRankings.length > 0
        })
        setFullRankingData([])
        setRankingData([])
        setCurrentPopularTags([])
        setLoading(false)
        setError(null)
        return
      }
      
      // デバッグ情報をVercelログに出力（カスタムランキングの場合）
      if (isCustomRanking) {
        serverLog.info('Custom ranking configuration', {
          actualGenre,
          customRankingConditions,
          customId: config.tag?.replace('custom:', ''),
          cacheGenre
        })
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
      
      // クライアント側のthrottle処理を削除（サーバー側に任せる）
      // await requestThrottle.throttle(apiUrl) // 削除: 二重制限を回避

      // 429エラー対応 - シンプルで確実な処理
      let response: Response | null = null
      
      try {
        response = await fetch(apiUrl, { signal })
        
        if (response.ok) {
          // 成功 - データ処理へ進む
        } else if (response.status === 429) {
          // 429エラー検出 - 即座にページリロード
          console.log('Rate limited (429). Reloading page immediately to reset state...')
          setError('読み込み中...')
          
          // 1秒待ってからリロード（メッセージを表示する時間）
          setTimeout(() => {
            window.location.reload()
          }, 1000)
          return
        } else {
          // その他のエラー
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
      } catch (err: any) {
        // ネットワークエラーなど
        if (err.name === 'AbortError') {
          return // キャンセルは無視
        }
        throw err
      }
      
      if (!response || !response.ok) {
        throw new Error('Failed to fetch data')
      }

      const data: RankingData = await response.json()
      
      // APIレスポンス情報をVercelログに出力
      serverLog.info('API response received', {
        itemsCount: data?.items?.length || 0,
        hasPopularTags: !!data?.popularTags,
        firstThreeItems: data?.items?.slice(0, 3).map(item => ({
          title: item.title,
          tags: item.tags,
          tagDetails: item.tagDetails
        })) || []
      })
      
      if (data && data.items && Array.isArray(data.items)) {
        let itemsToSet = data.items
        
        // カスタムランキングの場合、タグ条件でフィルタリング
        if (config.genre === 'custom' && customRankingConditions.length > 0) {
          const beforeCount = itemsToSet.length
          itemsToSet = applyCustomFilters(data.items, customRankingConditions)
          const afterCount = itemsToSet.length
          
          // フィルタリング結果をVercelログに出力
          serverLog.info('Custom ranking filtering applied', {
            beforeCount,
            afterCount,
            filteredOutCount: beforeCount - afterCount,
            conditionsApplied: customRankingConditions.length,
            firstThreeFiltered: itemsToSet.slice(0, 3).map(item => ({
              title: item.title,
              tags: item.tags,
              tagDetails: item.tagDetails
            }))
          })
        }
        
        // フィルタリング後のデータを保存
        setFullRankingData(itemsToSet)
        setRankingData(itemsToSet)
        
        // 人気タグを設定
        if (data.popularTags && Array.isArray(data.popularTags) && data.popularTags.length > 0) {
          setCurrentPopularTags(data.popularTags)
          savePopularTagsToCache(data.popularTags, config.genre, config.period)
        }
        
        // キャッシュに保存
        // カスタムランキングの場合は、ベースジャンルのキャッシュとして保存
        if (config.genre === 'custom' && actualGenre !== 'custom') {
          // ベースジャンルのフィルタリング前データをキャッシュ
          rankingCache.set(actualGenre, config.period, data.items, data.popularTags)
        } else if (config.genre !== 'custom') {
          // 通常のランキングデータをキャッシュ
          rankingCache.set(config.genre, config.period, itemsToSet, data.popularTags, config.tag)
        }
      } else {
        // カスタムランキングで空のデータを受信
        serverLog.warn('Empty data received from API', {
          apiResponse: data,
          config: {
            genre: config.genre,
            period: config.period,
            tag: config.tag
          }
        })
        setFullRankingData([])
        setRankingData([])
      }
    } catch (err: any) {
      // AbortErrorは無視（前のリクエストがキャンセルされた場合）
      if (err.name === 'AbortError') {
        return
      }
      
      // シンプルなエラーメッセージ
      setError('読み込み中...')
      setFullRankingData([])
      setRankingData([])
    } finally {
      // AbortErrorの場合はローディング状態を維持
      if (!isFallbackInitiatedRef.current && abortControllerRef.current?.signal.aborted !== true) {
        setLoading(false)
        setIsRetrying(false)
      }
    }
  }, [savePopularTagsToCache, deviceType, customRankings, newlyCreatedRankings])

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
    isRetrying,
    retryCount,
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