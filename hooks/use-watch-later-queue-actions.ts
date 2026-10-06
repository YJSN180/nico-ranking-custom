'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { navigateToVideo } from '@/lib/pwa-utils'
import type { WatchLaterItem } from '@/lib/watch-later'

interface UseWatchLaterQueueActionsOptions {
  items: WatchLaterItem[]
  removeItem: (videoId: string) => void
  clearItems: () => void
  markOpened: (videoId: string) => void
}

export function useWatchLaterQueueActions({
  items,
  removeItem,
  clearItems,
  markOpened,
}: UseWatchLaterQueueActionsOptions) {
  const [message, setMessage] = useState('')
  const messageTimerRef = useRef<number | null>(null)

  const showMessage = useCallback((nextMessage: string) => {
    setMessage(nextMessage)
    if (messageTimerRef.current) {
      window.clearTimeout(messageTimerRef.current)
    }
    messageTimerRef.current = window.setTimeout(() => {
      setMessage('')
      messageTimerRef.current = null
    }, 1800)
  }, [])

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) {
        window.clearTimeout(messageTimerRef.current)
      }
    }
  }, [])

  const openItem = useCallback(
    (item: WatchLaterItem) => {
      markOpened(item.id)
      navigateToVideo(item.url)
    },
    [markOpened],
  )

  const openAndRemove = useCallback(
    (item: WatchLaterItem) => {
      removeItem(item.id)
      navigateToVideo(item.url)
    },
    [removeItem],
  )

  const openFirst = useCallback(() => {
    const first = items[0]
    if (!first) return
    openItem(first)
  }, [items, openItem])

  const copyAllUrls = useCallback(async () => {
    if (items.length === 0) return

    try {
      await navigator.clipboard.writeText(
        items.map((item) => item.url).join('\n'),
      )
      showMessage('URLをコピーしました')
    } catch {
      showMessage('コピーに失敗しました')
    }
  }, [items, showMessage])

  return {
    message,
    openItem,
    openAndRemove,
    openFirst,
    copyAllUrls,
    clearItems,
  }
}
