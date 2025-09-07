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
    isFallbackInitiatedRef.current = false
    
    try {
      // Build API URL
      const params = new URLSearchParams()
      params.set('genre', config.genre)
      params.set('period', config.period)
      if (config.tag) params.set('tag', config.tag)
      
      // Fetch data
      const response = await fetch(`/api/ranking?${params.toString()}`, {
        signal: abortControllerRef.current.signal
        // Remove Cache-Control header to let server control caching
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
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
      
      setError(err instanceof Error ? err.message : 'Unknown error')
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])
  
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