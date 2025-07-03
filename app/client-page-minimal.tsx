'use client'

import { useEffect, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { RankingData } from '@/types/ranking'
import type { RankingConfig } from '@/types/ranking-config'

interface ClientWrapperProps {
  initialData: RankingData
  config: RankingConfig
}

// Ultra-minimal client component - only adds essential interactivity
export default function ClientPageMinimal({ initialData, config }: ClientWrapperProps) {
  const router = useRouter()
  
  // Lazy load selectors only when user scrolls up
  useEffect(() => {
    let selectorLoaded = false
    
    const loadSelectors = () => {
      if (selectorLoaded) return
      
      // Check if user scrolled up significantly
      if (window.scrollY < 200) {
        selectorLoaded = true
        
        // Dynamically import and mount selectors
        import('@/components/ranking-selector').then(({ RankingSelector }) => {
          const container = document.getElementById('selector-mount')
          if (container && !container.hasChildNodes()) {
            import('react-dom/client').then(({ createRoot }) => {
              const root = createRoot(container)
              root.render(
                <RankingSelector 
                  config={config}
                  onConfigChange={(newConfig) => {
                    startTransition(() => {
                      const params = new URLSearchParams()
                      if (newConfig.genre !== 'all') params.set('genre', newConfig.genre)
                      if (newConfig.period !== '24h') params.set('period', newConfig.period)
                      if (newConfig.tag) params.set('tag', newConfig.tag)
                      router.push(params.toString() ? `/?${params}` : '/')
                    })
                  }}
                />
              )
            })
          }
        })
      }
    }
    
    // Check on scroll with debounce
    let scrollTimeout: NodeJS.Timeout
    const handleScroll = () => {
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(loadSelectors, 100)
    }
    
    window.addEventListener('scroll', handleScroll)
    
    // Check immediately if already scrolled up
    loadSelectors()
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimeout)
    }
  }, [config, router])
  
  // Lazy load NG filter only on user interaction
  useEffect(() => {
    let ngLoaded = false
    let worker: Worker | null = null
    
    const loadNGFilter = async () => {
      if (ngLoaded) return
      ngLoaded = true
      
      try {
        // Load Worker in background
        worker = new Worker('/ranking-processor.worker.js')
        
        // Get NG list from localStorage
        const storedNGList = localStorage.getItem('user-ng-list')
        const storedPrefs = localStorage.getItem('user-preferences')
        
        if (storedNGList && storedPrefs) {
          const prefs = JSON.parse(storedPrefs)
          const ngData = JSON.parse(storedNGList)
          
          // Convert to worker-compatible format
          const ngList = {
            titles: [
              ...(ngData.videoTitles?.exact || []),
              ...(ngData.videoTitles?.partial || [])
            ],
            tags: [], // Not implemented yet
            users: [
              ...(ngData.authorIds || []),
              ...(ngData.authorNames?.exact || [])
            ],
            videoIds: ngData.videoIds || []
          }
          
          // Only process if NG filtering is enabled (check for enableNGFilter property)
          if (ngList.titles.length > 0 || ngList.users.length > 0 || ngList.videoIds.length > 0) {
            worker.postMessage({
              type: 'FILTER_RANKINGS',
              payload: { rankings: initialData.items, ngList }
            })
            
            worker.onmessage = (e) => {
              if (e.data.type === 'FILTER_COMPLETE') {
                // Update DOM directly for performance
                const hiddenIds = new Set(
                  initialData.items
                    .filter(item => !e.data.payload.filtered.find((f: any) => f.id === item.id))
                    .map(item => item.id)
                )
                
                document.querySelectorAll('[data-rank]').forEach(el => {
                  const article = el as HTMLElement
                  const link = article.querySelector('a[href*="nicovideo.jp"]')
                  if (link) {
                    const id = link.getAttribute('href')?.match(/watch\/(.+)$/)?.[1]
                    if (id && hiddenIds.has(id)) {
                      article.style.display = 'none'
                    }
                  }
                })
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to load NG filter:', error)
      }
    }
    
    // Load on first user interaction
    const interactionEvents = ['click', 'touchstart', 'keydown']
    const handleInteraction = () => {
      interactionEvents.forEach(event => 
        document.removeEventListener(event, handleInteraction)
      )
      loadNGFilter()
    }
    
    interactionEvents.forEach(event => 
      document.addEventListener(event, handleInteraction, { once: true })
    )
    
    return () => {
      interactionEvents.forEach(event => 
        document.removeEventListener(event, handleInteraction)
      )
      if (worker) {
        worker.terminate()
      }
    }
  }, [initialData])
  
  // Mount point for selectors
  return <div id="selector-mount" className="selector-container" />
}

// CSS for selector container
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = `
    .selector-container {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #fff;
      min-height: 48px;
      margin-bottom: 20px;
    }
    
    @media (max-width: 640px) {
      .selector-container {
        min-height: 96px;
      }
    }
  `
  document.head.appendChild(style)
}