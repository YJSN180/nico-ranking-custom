'use client'

import { useCallback, useEffect, useState } from 'react'
import type { RankingItem } from '@/types/ranking'
import {
  WATCH_LATER_STORAGE_KEY,
  WATCH_LATER_UPDATED_EVENT,
  addWatchLaterItem,
  clearWatchLaterItems,
  markWatchLaterItemOpened,
  readWatchLaterItems,
  removeWatchLaterItem,
  type WatchLaterItem,
  type WatchLaterSource,
} from '@/lib/watch-later'

export function useWatchLater() {
  const [items, setItems] = useState<WatchLaterItem[]>(() =>
    readWatchLaterItems(),
  )

  const sync = useCallback(() => {
    setItems(readWatchLaterItems())
  }, [])

  useEffect(() => {
    sync()

    const handleUpdate = () => sync()
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === WATCH_LATER_STORAGE_KEY) {
        sync()
      }
    }

    window.addEventListener(WATCH_LATER_UPDATED_EVENT, handleUpdate)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(WATCH_LATER_UPDATED_EVENT, handleUpdate)
      window.removeEventListener('storage', handleStorage)
    }
  }, [sync])

  const addItem = useCallback(
    (video: RankingItem, source?: WatchLaterSource) => {
      const result = addWatchLaterItem(video, source)
      setItems(result.items)
      return result
    },
    [],
  )

  const removeItem = useCallback((videoId: string) => {
    setItems(removeWatchLaterItem(videoId))
  }, [])

  const clearItems = useCallback(() => {
    setItems(clearWatchLaterItems())
  }, [])

  const markOpened = useCallback((videoId: string) => {
    setItems(markWatchLaterItemOpened(videoId))
  }, [])

  return {
    items,
    count: items.length,
    addItem,
    removeItem,
    clearItems,
    markOpened,
  }
}
