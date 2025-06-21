import { useState, useEffect, useRef } from 'react'

interface VideoInfo {
  title: string
  authorName: string | null
  isDeleted?: boolean
}

export function useVideoInfo(
  videoIds: string[], 
  page: number, 
  itemsPerPage: number
) {
  const [videoInfo, setVideoInfo] = useState<Record<string, VideoInfo>>({})
  const [isLoading, setIsLoading] = useState(false)
  const cacheRef = useRef(new Map<string, VideoInfo>())
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Create new AbortController
    const controller = new AbortController()
    abortControllerRef.current = controller
    
    const fetchVideoInfo = async () => {
      // Get video IDs for current page
      const startIndex = (page - 1) * itemsPerPage
      const endIndex = startIndex + itemsPerPage
      const pageVideoIds = videoIds.slice(startIndex, endIndex)

      // Filter out already cached IDs
      const idsToFetch = pageVideoIds.filter(id => !cacheRef.current.has(id))

      if (idsToFetch.length === 0) {
        // All cached, update state with cached data
        const cached: Record<string, VideoInfo> = {}
        pageVideoIds.forEach(id => {
          const info = cacheRef.current.get(id)
          if (info) cached[id] = info
        })
        setVideoInfo(cached)
        return
      }

      setIsLoading(true)

      try {
        // Use existing video info endpoint
        const response = await fetch('/api/admin/video-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          signal: controller.signal,
          body: JSON.stringify({ videoIds: idsToFetch })
        })

        if (response.ok) {
          const data = await response.json()
          
          // Update cache
          Object.entries(data.videos).forEach(([id, info]: [string, any]) => {
            cacheRef.current.set(id, {
              title: info.title || '削除された動画',
              authorName: info.authorName || null,
              isDeleted: info.isDeleted || false
            })
          })

          // Handle videos not in response (deleted or not found)
          idsToFetch.forEach(id => {
            if (!data.videos[id]) {
              cacheRef.current.set(id, {
                title: '削除された動画',
                authorName: null,
                isDeleted: true
              })
            }
          })

          // Update state with all page data
          const pageInfo: Record<string, VideoInfo> = {}
          pageVideoIds.forEach(id => {
            const info = cacheRef.current.get(id)
            if (info) pageInfo[id] = info
          })
          setVideoInfo(pageInfo)
        }
      } catch (error: any) {
        // Ignore AbortError
        if (error.name !== 'AbortError') {
          console.error('Failed to fetch video info:', error)
        }
      } finally {
        // Only update loading state if not aborted
        if (controller.signal.aborted !== true) {
          setIsLoading(false)
        }
      }
    }

    fetchVideoInfo()
    
    // Cleanup
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [videoIds, page, itemsPerPage])

  return { videoInfo, isLoading }
}