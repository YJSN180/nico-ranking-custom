import { useState, useEffect, useRef } from 'react'

interface VideoInfo {
  title: string
  authorName: string | null
  isDeleted?: boolean
}

interface VideoInfoApiItem {
  title?: string
  authorName?: string | null
  isDeleted?: boolean
}

interface VideoInfoApiResponse {
  videos: Record<string, VideoInfoApiItem | null>
}

const MAX_BATCH_SIZE = 50

export function useVideoInfo(
  videoIds: string[],
  page: number,
  itemsPerPage: number,
  ensureIds: string[] = []
) {
  const [videoInfo, setVideoInfo] = useState<Record<string, VideoInfo>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isEnsuring, setIsEnsuring] = useState(false)
  const cacheRef = useRef(new Map<string, VideoInfo>())
  const abortControllerRef = useRef<AbortController | null>(null)
  const ensureAbortControllerRef = useRef<AbortController | null>(null)

  const updateCache = (entries: Record<string, VideoInfo>) => {
    if (Object.keys(entries).length === 0) return
    Object.entries(entries).forEach(([id, info]) => {
      cacheRef.current.set(id, info)
    })
    setVideoInfo(prev => ({ ...prev, ...entries }))
  }

  const fetchVideoInfoBatch = async (ids: string[], controller: AbortController) => {
    if (ids.length === 0) return

    const response = await fetch('/api/admin/video-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
      body: JSON.stringify({ videoIds: ids })
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch video info: ${response.status}`)
    }

    const data = (await response.json()) as VideoInfoApiResponse
    const updates: Record<string, VideoInfo> = {}

    Object.entries(data.videos || {}).forEach(([id, info]) => {
      updates[id] = {
        title: info?.title || '削除された動画',
        authorName: info?.authorName ?? null,
        isDeleted: info?.isDeleted || false
      }
    })

    ids.forEach(id => {
      if (!data.videos || !data.videos[id]) {
        updates[id] = {
          title: '削除された動画',
          authorName: null,
          isDeleted: true
        }
      }
    })

    updateCache(updates)
  }

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
        updateCache(cached)
        return
      }

      setIsLoading(true)

      try {
        await fetchVideoInfoBatch(idsToFetch, controller)
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Failed to fetch video info:', error)
        }
      } finally {
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

  useEffect(() => {
    if (!ensureIds || ensureIds.length === 0) return

    if (ensureAbortControllerRef.current) {
      ensureAbortControllerRef.current.abort()
    }

    const controller = new AbortController()
    ensureAbortControllerRef.current = controller

    const ensureMissing = async () => {
      const uniqueIds = Array.from(
        new Set(
          ensureIds
            .map(id => (typeof id === 'string' ? id.trim() : ''))
            .filter(Boolean)
        )
      )

      const missingIds = uniqueIds.filter(id => !cacheRef.current.has(id))
      if (missingIds.length === 0) return

      setIsEnsuring(true)

      try {
        for (let i = 0; i < missingIds.length; i += MAX_BATCH_SIZE) {
          if (controller.signal.aborted) break
          const batch = missingIds.slice(i, i + MAX_BATCH_SIZE)
          await fetchVideoInfoBatch(batch, controller)
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Failed to ensure video info:', error)
        }
      } finally {
        if (controller.signal.aborted !== true) {
          setIsEnsuring(false)
        }
      }
    }

    ensureMissing()

    return () => {
      if (ensureAbortControllerRef.current) {
        ensureAbortControllerRef.current.abort()
      }
    }
  }, [ensureIds])

  return { videoInfo, isLoading: isLoading || isEnsuring }
}
