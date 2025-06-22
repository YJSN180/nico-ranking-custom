'use client'

import React, { useCallback, useRef, useEffect } from 'react'
import { FixedSizeList as List } from 'react-window'
import RankingItemComponent from './ranking-item'
import type { RankingItem } from '@/types/ranking'

interface VirtualRankingListProps {
  items: RankingItem[]
  isMobile: boolean
  height?: number
}

export function VirtualRankingList({ items, isMobile, height = 800 }: VirtualRankingListProps) {
  const listRef = useRef<List>(null)
  const itemHeight = isMobile ? 120 : 90
  
  // スクロール位置の復元
  useEffect(() => {
    const savedScrollOffset = sessionStorage.getItem('ranking-scroll-offset')
    if (savedScrollOffset && listRef.current) {
      listRef.current.scrollTo(parseInt(savedScrollOffset, 10))
      sessionStorage.removeItem('ranking-scroll-offset')
    }
  }, [])
  
  // スクロール位置の保存
  const handleScroll = useCallback(({ scrollOffset }: { scrollOffset: number }) => {
    // 動画ページへの遷移時に保存
    const handleNavigation = () => {
      sessionStorage.setItem('ranking-scroll-offset', scrollOffset.toString())
    }
    
    window.addEventListener('beforeunload', handleNavigation, { once: true })
    
    return () => {
      window.removeEventListener('beforeunload', handleNavigation)
    }
  }, [])
  
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = items[index]
    
    return (
      <div style={style}>
        <RankingItemComponent 
          key={item.id} 
          item={item} 
          isMobile={isMobile} 
        />
      </div>
    )
  }, [items, isMobile])
  
  // ビューポートの高さを動的に計算
  const calculateHeight = useCallback(() => {
    if (typeof window === 'undefined') return height
    
    // ヘッダー、セレクター、フッターの高さを引く
    const headerHeight = 60
    const selectorHeight = 88 // RankingSelector + TagSelector
    const footerHeight = 200
    const margin = 40
    
    return Math.max(
      400, // 最小高さ
      window.innerHeight - headerHeight - selectorHeight - footerHeight - margin
    )
  }, [height])
  
  const [listHeight, setListHeight] = React.useState(calculateHeight())
  
  useEffect(() => {
    const handleResize = () => {
      setListHeight(calculateHeight())
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [calculateHeight])
  
  return (
    <List
      ref={listRef}
      height={listHeight}
      itemCount={items.length}
      itemSize={itemHeight}
      width="100%"
      overscanCount={5} // 画面外に5アイテムのバッファ
      onScroll={handleScroll}
      style={{
        // スクロールバーのスタイリング
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--border-color) var(--surface-color)'
      }}
    >
      {Row}
    </List>
  )
}