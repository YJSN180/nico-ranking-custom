'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import RankingItemComponent from '@/components/ranking-item'
import type { RankingItem } from '@/types/ranking'

interface InfiniteScrollListProps {
  items: RankingItem[]
  initialDisplayCount?: number
  batchSize?: number
  restoreScrollPosition?: number
}

export function InfiniteScrollList({
  items,
  initialDisplayCount = 50,
  batchSize = 50,
  restoreScrollPosition
}: InfiniteScrollListProps) {
  const [displayCount, setDisplayCount] = useState(initialDisplayCount)
  const [isLoading, setIsLoading] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  // 表示するアイテム
  const displayItems = items.slice(0, displayCount)
  const hasMore = displayCount < items.length

  // 追加読み込み
  const loadMore = useCallback(() => {
    if (!hasMore || isLoading) return
    
    setIsLoading(true)
    // 実際のAPIコールではないが、UXのために少し遅延を入れる
    setTimeout(() => {
      setDisplayCount(prev => Math.min(prev + batchSize, items.length))
      setIsLoading(false)
    }, 300)
  }, [hasMore, isLoading, batchSize, items.length])

  // IntersectionObserverの設定
  useEffect(() => {
    if (!triggerRef.current) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore()
        }
      },
      { rootMargin: '100px' }
    )

    observerRef.current.observe(triggerRef.current)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [loadMore])

  // スクロール位置の復元
  useEffect(() => {
    if (restoreScrollPosition && displayItems.length > 0) {
      // コンテンツがレンダリングされてから復元
      setTimeout(() => {
        window.scrollTo(0, restoreScrollPosition)
      }, 100)
    }
  }, [restoreScrollPosition, displayItems.length])

  // アイテムが変更された時の処理
  useEffect(() => {
    // 新しいアイテムセットになった場合、表示数をリセット
    setDisplayCount(Math.min(initialDisplayCount, items.length))
  }, [items, initialDisplayCount])

  if (items.length === 0) {
    return null
  }

  return (
    <>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {displayItems.map((item) => (
          <RankingItemComponent key={item.id} item={item} />
        ))}
      </ul>
      
      {hasMore && (
        <div
          ref={triggerRef}
          data-testid="scroll-trigger"
          style={{
            height: '100px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {isLoading && (
            <div
              data-testid="loading-indicator"
              style={{
                fontSize: '14px',
                color: '#666',
                padding: '20px'
              }}
            >
              読み込み中...
            </div>
          )}
        </div>
      )}
    </>
  )
}