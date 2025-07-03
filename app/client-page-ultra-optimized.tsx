'use client'

import React, { useState, useEffect, useCallback, useMemo, startTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { RankingData, RankingItem } from '@/types/ranking'
import type { RankingConfig, RankingGenre } from '@/types/ranking-config'
import dynamic from 'next/dynamic'
import './client-page.css'

// Ultra-lightweight component loading with prefetch disabled
const RankingSelector = dynamic(() => 
  import('@/components/ranking-selector').then(mod => ({ default: mod.RankingSelector })),
  { 
    loading: () => <div style={{ height: '48px', background: 'var(--skeleton-bg)' }} />,
    ssr: true 
  }
)

const RankingItemResponsive = dynamic(() => 
  import('@/components/ranking-item-responsive'),
  { 
    loading: () => <div style={{ height: '120px', background: 'var(--skeleton-bg)', marginBottom: '8px' }} />,
    ssr: false // Client-only for performance
  }
)

const Pagination = dynamic(() => 
  import('@/components/pagination'),
  { 
    loading: () => null,
    ssr: false 
  }
)

const TagSelector = dynamic(() => 
  import('@/components/tag-selector').then(mod => ({ default: mod.TagSelector })),
  { 
    loading: () => null,
    ssr: false 
  }
)

// Lazy load hooks only when needed
let useUserPreferences: any = null
let useUserNGList: any = null
let useRankingProcessorWorker: any = null

interface ClientPageProps {
  initialData: { items: RankingItem[], popularTags?: string[] }
  allRankingData?: RankingItem[]
  initialGenre?: string
  initialPeriod?: string
  initialTag?: string
  initialPage?: number
  popularTags?: string[]
}

const ITEMS_PER_PAGE = 100

export default function ClientPageUltraOptimized({ 
  initialData, 
  allRankingData,
  initialGenre = 'all', 
  initialPeriod = '24h', 
  initialTag, 
  initialPage = 1,
  popularTags = []
}: ClientPageProps) {
  const router = useRouter()
  
  // Initial state - use SSR data directly
  const [config, setConfig] = useState<RankingConfig>({
    period: initialPeriod as '24h' | 'hour',
    genre: initialGenre as RankingGenre,
    tag: initialTag
  })
  
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [isHydrated, setIsHydrated] = useState(false)
  const [rankingData, setRankingData] = useState(initialData.items)
  const [currentPopularTags, setCurrentPopularTags] = useState(popularTags)
  const [ngFilterEnabled, setNgFilterEnabled] = useState(false)
  
  // Defer hydration and hook loading
  useEffect(() => {
    // Load hooks on demand
    const loadHooks = async () => {
      const [prefMod, ngMod, workerMod] = await Promise.all([
        import('@/hooks/use-user-preferences'),
        import('@/hooks/use-user-ng-list'),
        import('@/hooks/use-ranking-processor-worker')
      ])
      
      useUserPreferences = prefMod.useUserPreferences
      useUserNGList = ngMod.useUserNGList
      useRankingProcessorWorker = workerMod.useRankingProcessorWorker
      
      startTransition(() => {
        setIsHydrated(true)
        setNgFilterEnabled(true)
      })
    }
    
    // Delay hook loading until after initial render
    if (typeof window !== 'undefined') {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => loadHooks(), { timeout: 1000 })
      } else {
        setTimeout(loadHooks, 100)
      }
    }
  }, [])
  
  // Memoized pagination
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    const end = start + ITEMS_PER_PAGE
    return rankingData.slice(start, end)
  }, [rankingData, currentPage])
  
  const totalPages = Math.ceil(rankingData.length / ITEMS_PER_PAGE)
  
  // Handle config changes
  const handleConfigChange = useCallback((newConfig: RankingConfig) => {
    startTransition(() => {
      setConfig(newConfig)
      setCurrentPage(1)
      
      // Update URL
      const params = new URLSearchParams()
      if (newConfig.genre && newConfig.genre !== 'all') params.set('genre', newConfig.genre)
      if (newConfig.period && newConfig.period !== '24h') params.set('period', newConfig.period)
      if (newConfig.tag) params.set('tag', newConfig.tag)
      
      const newUrl = params.toString() ? `/?${params.toString()}` : '/'
      router.push(newUrl)
    })
  }, [router])
  
  const handlePageChange = useCallback((page: number) => {
    startTransition(() => {
      setCurrentPage(page)
      window.scrollTo({ top: 0, behavior: 'instant' })
    })
  }, [])
  
  return (
    <>
      <RankingSelector
        config={config}
        onConfigChange={handleConfigChange}
      />
      
      {config.tag && popularTags.length > 0 && (
        <TagSelector
          config={config}
          onConfigChange={handleConfigChange}
          popularTags={popularTags}
        />
      )}
      
      <div style={{ minHeight: '600px' }}>
        {paginatedData.map((item) => (
          <RankingItemResponsive
            key={item.id}
            item={item}
          />
        ))}
      </div>
      
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={rankingData.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={handlePageChange}
        />
      )}
    </>
  )
}