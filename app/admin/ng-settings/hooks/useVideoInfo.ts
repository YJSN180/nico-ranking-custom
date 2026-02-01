import { useState, useEffect, useRef, useCallback } from 'react'

interface VideoInfo {
  title: string
  authorName: string | null
  isDeleted?: boolean
}

interface VideoInfoError {
  status?: number
  message: string
}

interface VideoInfoApiItem {
  title?: string
  authorName?: string | null
  isDeleted?: boolean
}

interface VideoInfoApiResponse {
  videos: Record<string, VideoInfoApiItem | null>
}

interface DerivedInfoResponse extends VideoInfoApiResponse {
  updatedAt?: string | null
  lastRefreshAt?: string | null
}

export function useVideoInfo(
  videoIds: string[],
  page: number,
  itemsPerPage: number,
  ensureIds: string[] = []
) {
  const [videoInfo, setVideoInfo] = useState<Record<string, VideoInfo>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isEnsuring, setIsEnsuring] = useState(false)
  const [error, setError] = useState<VideoInfoError | null>(null)
  const cacheRef = useRef(new Map<string, VideoInfo>())
  const abortControllerRef = useRef<AbortController | null>(null)
  const ensureAbortControllerRef = useRef<AbortController | null>(null)
  const derivedCacheLoadedRef = useRef(false)

  const updateCache = useCallback((entries: Record<string, VideoInfo>) => {
    if (Object.keys(entries).length === 0) return
    Object.entries(entries).forEach(([id, info]) => {
      cacheRef.current.set(id, info)
    })
    setVideoInfo(prev => ({ ...prev, ...entries }))
  }, [])

  const normalizeInfo = useCallback((info?: VideoInfoApiItem | null): VideoInfo => {
    const isDeleted = info?.isDeleted ?? false
    return {
      title: info?.title || (isDeleted ? '削除された動画' : '情報未取得'),
      authorName: info?.authorName ?? null,
      isDeleted
    }
  }, [])

  const fetchVideoInfoBatch = useCallback(
    async (ids: string[], controller: AbortController) => {
      if (ids.length === 0) return

      const response = await fetch('/api/admin/video-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
        body: JSON.stringify({ videoIds: ids })
      })

      if (!response.ok) {
        console.warn('[useVideoInfo] Failed to fetch video info', {
          status: response.status,
          statusText: response.statusText
        })
        setError({
          status: response.status,
          message:
            response.status === 401
              ? '動画情報の取得に失敗しました（認証が必要です）。ページを再読み込みしてください。'
              : `動画情報の取得に失敗しました（HTTP ${response.status}）`
        })
        throw new Error(`Failed to fetch video info: ${response.status}`)
      }

      const data = (await response.json()) as VideoInfoApiResponse
      const updates: Record<string, VideoInfo> = {}

      Object.entries(data.videos || {}).forEach(([id, info]) => {
        updates[id] = normalizeInfo(info)
      })

      ids.forEach(id => {
        if (!data.videos || typeof data.videos[id] === 'undefined') {
          updates[id] = normalizeInfo(null)
        }
      })

      updateCache(updates)
      setError(null)
    },
    [normalizeInfo, updateCache]
  )

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
          console.warn('[useVideoInfo] Failed to fetch video info', error)
          if (!error?.status) {
            setError({
              message: '動画情報の取得に失敗しました（通信エラー）'
            })
          }
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
  }, [videoIds, page, itemsPerPage, updateCache, normalizeInfo, fetchVideoInfoBatch])

  useEffect(() => {
    if (!ensureIds || ensureIds.length === 0) return

    if (ensureAbortControllerRef.current) {
      ensureAbortControllerRef.current.abort()
    }

    const controller = new AbortController()
    ensureAbortControllerRef.current = controller

    const fetchDerivedInfoMap = async (controller: AbortController) => {
      const response = await fetch('/api/admin/ng-list/derived-info', {
        credentials: 'same-origin',
        signal: controller.signal
      })

      if (!response.ok) {
        console.warn('[useVideoInfo] Failed to fetch derived info cache', {
          status: response.status,
          statusText: response.statusText
        })
        setError({
          status: response.status,
          message:
            response.status === 401
              ? '動画情報の取得に失敗しました（認証が必要です）。ページを再読み込みしてください。'
              : `動画情報の取得に失敗しました（HTTP ${response.status}）`
        })
        throw new Error(`Failed to fetch derived info: ${response.status}`)
      }

      const data = (await response.json()) as DerivedInfoResponse
      const updates: Record<string, VideoInfo> = {}
      Object.entries(data.videos || {}).forEach(([id, info]) => {
        updates[id] = normalizeInfo(info)
      })
      updateCache(updates)
      derivedCacheLoadedRef.current = true
      setError(null)
    }

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
        if (!derivedCacheLoadedRef.current) {
          await fetchDerivedInfoMap(controller)
        }

        const stillMissing = uniqueIds.filter(id => !cacheRef.current.has(id))
        if (stillMissing.length > 0) {
          const placeholders: Record<string, VideoInfo> = {}
          stillMissing.forEach(id => {
            placeholders[id] = normalizeInfo(null)
          })
          updateCache(placeholders)
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.warn('[useVideoInfo] Failed to ensure video info', error)
          if (!error?.status) {
            setError({
              message: '動画情報の取得に失敗しました（通信エラー）'
            })
          }
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
  }, [ensureIds, normalizeInfo, updateCache])

  return { videoInfo, isLoading: isLoading || isEnsuring, error }
}
