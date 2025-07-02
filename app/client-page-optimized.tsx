'use client'

import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense, startTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RankingSelector } from '@/components/ranking-selector'
import type { RankingData, RankingItem } from '@/types/ranking'
import type { RankingConfig, RankingGenre } from '@/types/ranking-config'
import './client-page.css'

// Dynamic imports with webpackPreload for critical components
const RankingItemResponsive = lazy(() => 
  import(/* webpackPreload: true */ '@/components/ranking-item-responsive')
)

// Lower priority dynamic imports
const Pagination = lazy(() => 
  import(/* webpackPrefetch: true */ '@/components/pagination')
)
const TagSelector = lazy(() => 
  import(/* webpackPrefetch: true */ '@/components/tag-selector').then(mod => ({ default: mod.TagSelector }))
)

// Direct imports for hooks (can't be lazy loaded)
import { useUserPreferences } from '@/hooks/use-user-preferences'
import { useUserNGList } from '@/hooks/use-user-ng-list'
import { useRankingProcessorWorker } from '@/hooks/use-ranking-processor-worker'

interface ClientPageProps {
  initialData: { items: RankingItem[], popularTags?: string[] }
  allRankingData?: RankingItem[]
  initialGenre?: string
  initialPeriod?: string
  initialTag?: string
  initialPage?: number
  popularTags?: string[]
}

// Progressive enhancement: Show data immediately, enhance later
const ITEMS_PER_PAGE = 100
const DISPLAY_LIMITS = {
  TAG: 300,
  GENRE: 500,
}

// Loading skeleton for ranking items
function RankingItemSkeleton() {
  return (
    <div style={{ 
      height: '120px', 
      backgroundColor: 'var(--skeleton-bg)', 
      marginBottom: '8px',
      borderRadius: '4px',
      animation: 'pulse 1.5s ease-in-out infinite'
    }} />
  )
}

export default function ClientPageOptimized({ 
  initialData, 
  allRankingData,
  initialGenre = 'all', 
  initialPeriod = '24h', 
  initialTag, 
  initialPage = 1,
  popularTags = []
}: ClientPageProps) {
  const router = useRouter()
  
  // User preferences and NG list
  const { preferences, updatePreferences } = useUserPreferences()
  const { ngList } = useUserNGList()
  
  // Web Worker for heavy processing
  const { filterRankings, isProcessing } = useRankingProcessorWorker()
  
  // Initial state from SSR data
  const [config, setConfig] = useState<RankingConfig>({
    period: initialPeriod as '24h' | 'hour',
    genre: initialGenre as RankingGenre,
    tag: initialTag
  })
  
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [isHydrated, setIsHydrated] = useState(false)
  const [rankingData, setRankingData] = useState(initialData.items)
  const [currentPopularTags, setCurrentPopularTags] = useState(popularTags)
  const [unfilteredData, setUnfilteredData] = useState(initialData.items)
  
  // Progressive hydration
  useEffect(() => {
    startTransition(() => {
      setIsHydrated(true)
    })
  }, [])
  
  // Apply NG filtering using Web Worker when data or NG list changes
  useEffect(() => {
    if (!isHydrated) return
    
    // Use Web Worker to filter data off the main thread
    const applyNGFilter = async () => {
      try {
        const filtered = await filterRankings(unfilteredData, ngList)
        setRankingData(filtered)
      } catch (error) {
        console.error('Worker filtering failed:', error)
        // Fallback to unfiltered data on error
        setRankingData(unfilteredData)
      }
    }
    
    startTransition(() => {
      applyNGFilter()
    })
  }, [unfilteredData, ngList, isHydrated, filterRankings])
  
  // Simple pagination without complex calculations
  const displayItems = useMemo(() => {
    if (config.tag) {
      return rankingData
    }
    
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    return rankingData.slice(startIndex, endIndex)
  }, [rankingData, config.tag, currentPage])
  
  const totalPages = useMemo(() => {
    if (config.tag) return 1
    return Math.ceil(rankingData.length / ITEMS_PER_PAGE)
  }, [rankingData.length, config.tag])
  
  // Lightweight config change handler
  const handleConfigChange = useCallback((newConfig: RankingConfig) => {
    if (
      newConfig.genre === config.genre &&
      newConfig.period === config.period &&
      newConfig.tag === config.tag
    ) {
      return
    }
    
    setConfig(newConfig)
    setCurrentPage(1)
    
    // Update URL
    const params = new URLSearchParams()
    if (newConfig.genre !== 'all') params.set('genre', newConfig.genre)
    if (newConfig.period !== '24h') params.set('period', newConfig.period)
    if (newConfig.tag) params.set('tag', newConfig.tag)
    
    router.push(params.toString() ? `?${params.toString()}` : '/', { scroll: false })
  }, [config, router])
  
  const handlePageChange = useCallback((page: number) => {
    if (page === currentPage) return
    
    startTransition(() => {
      setCurrentPage(page)
    })
    
    // Update URL with page
    const params = new URLSearchParams()
    if (config.genre !== 'all') params.set('genre', config.genre)
    if (config.period !== '24h') params.set('period', config.period)
    if (config.tag) params.set('tag', config.tag)
    if (page > 1) params.set('page', page.toString())
    
    router.push(params.toString() ? `?${params.toString()}` : '/', { scroll: false })
  }, [currentPage, config, router])
  
  return (
    <>
      <div className="selectors-container">
        <RankingSelector config={config} onConfigChange={handleConfigChange} />
        {isHydrated && (
          <Suspense fallback={<div style={{ height: '100px' }} />}>
            <TagSelector 
              config={config} 
              onConfigChange={handleConfigChange} 
              popularTags={currentPopularTags} 
            />
          </Suspense>
        )}
      </div>
      
      {/* Show processing indicator when Worker is filtering */}
      {isProcessing && (
        <div style={{ 
          textAlign: 'center', 
          padding: '20px',
          color: 'var(--text-secondary)'
        }}>
          フィルタリング中...
        </div>
      )}
      
      {!isProcessing && displayItems.length > 0 && (
        <>
          {/* Top pagination */}
          {!config.tag && isHydrated && (
            <Suspense fallback={<div style={{ height: '60px' }} />}>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={rankingData.length}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={handlePageChange}
              />
            </Suspense>
          )}
          
          {/* Ranking items with progressive loading */}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {displayItems.map((item, index) => (
              <Suspense 
                key={item.id} 
                fallback={<RankingItemSkeleton />}
              >
                <RankingItemResponsive 
                  item={item}
                />
              </Suspense>
            ))}
          </ul>
          
          {/* Bottom pagination */}
          {!config.tag && isHydrated && (
            <Suspense fallback={<div style={{ height: '60px' }} />}>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={rankingData.length}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={handlePageChange}
              />
            </Suspense>
          )}
        </>
      )}
    </>
  )
}