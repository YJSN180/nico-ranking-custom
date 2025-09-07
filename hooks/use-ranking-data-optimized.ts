import { useState, useRef, useCallback, useEffect } from 'react'
import { useRankingProcessorWorker } from './use-ranking-processor-worker'
import type { RankingItem } from '@/types/ranking'
import type { RankingConfig } from '@/types/ranking-config'
import type { NGList } from '@/types/ng-list'

interface UseRankingDataProps {
  initialData: { items: RankingItem[] }
  allRankingData?: RankingItem[]
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

// Cache for filtered results
const filterCache = new Map<string, RankingItem[]>()

export function useRankingDataOptimized({
  initialData,
  allRankingData = [],
  ngList,
  ngListVersion
}: UseRankingDataProps): UseRankingDataReturn {
  const [rankingData, setRankingData] = useState<RankingItem[]>(initialData.items || [])
  const [fullRankingData, setFullRankingData] = useState<RankingItem[]>(allRankingData)
  const [currentPopularTags, setCurrentPopularTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  
  const abortControllerRef = useRef<AbortController | null>(null)
  const tagsAbortControllerRef = useRef<AbortController | null>(null)
  const isFallbackInitiatedRef = useRef(false)
  
  // Use Web Worker for filtering
  const { filterRankings } = useRankingProcessorWorker()
  
  // Apply NG filtering with Web Worker
  useEffect(() => {
    if (!rankingData.length) return
    
    // Create cache key
    const cacheKey = `${ngListVersion}-${rankingData.length}`
    
    // Check cache first
    const cached = filterCache.get(cacheKey)
    if (cached) {
      setRankingData(cached)
      return
    }
    
    // Use Web Worker for filtering
    const applyFilter = async () => {
      try {
        const filtered = await filterRankings(rankingData, ngList)
        
        // Cache the result
        filterCache.set(cacheKey, filtered)
        
        // Limit cache size
        if (filterCache.size > 10) {
          const firstKey = filterCache.keys().next().value
          filterCache.delete(firstKey)
        }
        
        setRankingData(filtered)
      } catch (error) {
        console.error('Filter error:', error)
        // Fallback to unfiltered data on error
        setRankingData(rankingData)
      }
    }
    
    applyFilter()
  }, [ngListVersion, rankingData.length]) // Depend on length to detect data changes
  
  // Fetch ranking data
  const fetchRankingData = useCallback(async (config: RankingConfig) => {
    // Cancel any existing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    if (tagsAbortControllerRef.current) {
      tagsAbortControllerRef.current.abort()
    }
    
    // Create new abort controllers
    abortControllerRef.current = new AbortController()
    tagsAbortControllerRef.current = new AbortController()
    
    setLoading(true)
    setError(null)
    setRetryCount(0)
    setIsRetrying(false)
    isFallbackInitiatedRef.current = false
    
    try {
      // Build API URL
      const params = new URLSearchParams()
      params.set('genre', config.genre)
      params.set('period', config.period)
      if (config.tag) params.set('tag', config.tag)
      
      // Fetch data with retry logic
      let response: Response | null = null
      let lastError: Error | null = null
      const maxRetries = 3
      const baseDelay = 1000 // 1 second
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            setIsRetrying(true)
            setRetryCount(attempt)
            // Exponential backoff: 1s, 2s, 4s
            const delay = baseDelay * Math.pow(2, attempt - 1)
            await new Promise(resolve => setTimeout(resolve, delay))
          }
          
          response = await fetch(`/api/ranking?${params.toString()}`, {
            signal: abortControllerRef.current.signal
            // Remove Cache-Control header to let server control caching
          })
          
          if (response.ok) {
            break // Success, exit retry loop
          }
          
          if (response.status === 429) {
            // Rate limit error - retry with backoff
            const retryAfter = response.headers.get('Retry-After')
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : baseDelay * Math.pow(2, attempt)
            
            if (attempt < maxRetries) {
              console.log(`Rate limited (429). Retrying in ${waitTime/1000}s... (attempt ${attempt + 1}/${maxRetries})`)
              lastError = new Error(`一時的にアクセスが制限されています。${Math.ceil(waitTime/1000)}秒後に再試行します...`)
              setError(lastError.message)
              continue
            }
          }
          
          // Other errors - don't retry
          throw new Error(`HTTP error! status: ${response.status}`)
          
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw err // Re-throw abort errors
          }
          lastError = err as Error
          if (attempt === maxRetries) {
            throw lastError
          }
        }
      }
      
      if (!response || !response.ok) {
        throw lastError || new Error('Failed to fetch data after retries')
      }
      
      const data = await response.json()
      
      // Update state with new data
      setRankingData(data.items || [])
      setFullRankingData(data.items || [])
      
      // Update popular tags if available
      if (data.popularTags) {
        setCurrentPopularTags(data.popularTags)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, ignore
        return
      }
      
      // More user-friendly error messages
      let errorMessage = 'データの取得に失敗しました'
      
      if (err instanceof Error) {
        if (err.message.includes('429') || err.message.includes('制限')) {
          errorMessage = 'アクセスが集中しています。しばらくお待ちください...'
        } else if (err.message.includes('network') || err.message.includes('fetch')) {
          errorMessage = 'ネットワークエラーが発生しました。接続を確認してください'
        } else if (err.message.includes('timeout')) {
          errorMessage = 'タイムアウトしました。もう一度お試しください'
        } else {
          errorMessage = err.message
        }
      }
      
      setError(errorMessage)
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
      setIsRetrying(false)
    }
  }, [])
  
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