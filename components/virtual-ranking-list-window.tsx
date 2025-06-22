'use client'

import React, { useCallback, useRef, useEffect, useState } from 'react'
import { FixedSizeList as List } from 'react-window'
import RankingItemComponent from './ranking-item'
import type { RankingItem } from '@/types/ranking'

interface VirtualRankingListWindowProps {
  items: RankingItem[]
  isMobile: boolean
}

// ウィンドウサイズを取得するカスタムフック
const useWindowSize = () => {
  const [size, setSize] = useState({ width: 0, height: 0 })
  
  useEffect(() => {
    function updateSize() {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', updateSize)
    updateSize()
    return () => window.removeEventListener('resize', updateSize)
  }, [])
  
  return size
}

export function VirtualRankingListWindow({ items, isMobile }: VirtualRankingListWindowProps) {
  const listRef = useRef<List>(null)
  const itemHeight = isMobile ? 110 : 134
  const { height: windowHeight } = useWindowSize()
  
  // ヘッダーとセレクターの高さ
  const HEADER_HEIGHT = 60
  const SELECTOR_HEIGHT = 88
  const HEADER_OFFSET = HEADER_HEIGHT + SELECTOR_HEIGHT
  
  // スクロール位置の復元
  useEffect(() => {
    const savedScrollPosition = sessionStorage.getItem('ranking-scroll-position')
    if (savedScrollPosition) {
      const scrollY = parseInt(savedScrollPosition, 10)
      // 少し遅延させてから復元（DOMが準備できるまで待つ）
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY)
        sessionStorage.removeItem('ranking-scroll-position')
      })
    }
  }, [])
  
  // スクロール位置の保存（動画ページへの遷移時）
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('a')
      
      // ニコニコ動画へのリンクの場合のみスクロール位置を保存
      if (link && (link.href.includes('nicovideo.jp') || link.href.includes('niconico.jp'))) {
        sessionStorage.setItem('ranking-scroll-position', window.scrollY.toString())
      }
    }
    
    document.addEventListener('click', handleLinkClick)
    return () => document.removeEventListener('click', handleLinkClick)
  }, [])
  
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = items[index]
    if (!item) return null
    
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
  
  // リスト全体の高さを確保するためのスペーサー
  const totalHeight = items.length * itemHeight
  
  return (
    <div>
      {/* リスト全体の高さを確保するスペーサー */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* 仮想スクロールリスト */}
        <List
          ref={listRef}
          height={windowHeight - HEADER_OFFSET}
          itemCount={items.length}
          itemSize={itemHeight}
          width="100%"
          useIsScrolling // ウィンドウスクロールモードを有効化
          style={{
            position: 'sticky',
            top: HEADER_OFFSET,
            willChange: 'transform' // スクロールパフォーマンス最適化
          }}
        >
          {Row}
        </List>
      </div>
    </div>
  )
}