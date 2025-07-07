'use client'

import React, { forwardRef, useImperativeHandle, useState, useCallback, useRef, useEffect } from 'react'
import { useGenreOrderV2 } from '@/hooks/use-genre-order-v2'
import { GenreItem } from './genre-item'
import { RankingGenre } from '@/types/ranking-config'
import styles from './genre-order.module.css'

interface GenreOrderCustomizerProps {
  onChangesUpdate?: (hasChanges: boolean) => void
}

export interface GenreOrderCustomizerRef {
  applyChanges: () => void
  cancelChanges: () => void
}

export const GenreOrderCustomizer = forwardRef<GenreOrderCustomizerRef, GenreOrderCustomizerProps>(
  function GenreOrderCustomizer({ onChangesUpdate }, ref) {
    const {
      items,
      hasChanges,
      moveItem,
      toggleVisibility,
      resetToDefault,
      applyChanges,
      cancelChanges
    } = useGenreOrderV2()

    // ドラッグ中のアイテム
    const [draggedGenre, setDraggedGenre] = useState<RankingGenre | null>(null)
    
    // 自動スクロール用の参照とstate
    const scrollContainerRef = useRef<HTMLElement | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 })
    const scrollIntervalRef = useRef<number | null>(null)
    const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null)

    // 変更状態を親に通知
    React.useEffect(() => {
      onChangesUpdate?.(hasChanges)
    }, [hasChanges, onChangesUpdate])

    // スクロールコンテナを検索
    useEffect(() => {
      // 親要素から overflow-y が auto または scroll の要素を探す
      const findScrollContainer = () => {
        let element = document.querySelector('.genreOrderContainer')?.parentElement
        while (element && element.tagName !== 'BODY') {
          const computedStyle = getComputedStyle(element)
          if (computedStyle.overflowY === 'auto' || 
              computedStyle.overflowY === 'scroll') {
            return element
          }
          element = element.parentElement
        }
        return null
      }
      
      scrollContainerRef.current = findScrollContainer()
    }, [])

    // 自動スクロール処理
    useEffect(() => {
      if (!isDragging || !scrollContainerRef.current) return

      const container = scrollContainerRef.current
      const containerRect = container.getBoundingClientRect()
      
      // スクロール検知エリアのサイズ（上下100px）
      const scrollZoneSize = 100
      // 最大スクロール速度
      const maxScrollSpeed = 20
      
      const autoScroll = () => {
        const mouseY = dragPosition.y
        
        // 上部エリアでのスクロール
        if (mouseY < containerRect.top + scrollZoneSize) {
          const distance = containerRect.top + scrollZoneSize - mouseY
          const speed = Math.min((distance / scrollZoneSize) * maxScrollSpeed, maxScrollSpeed)
          container.scrollTop -= speed
          setScrollDirection('up')
        }
        // 下部エリアでのスクロール
        else if (mouseY > containerRect.bottom - scrollZoneSize) {
          const distance = mouseY - (containerRect.bottom - scrollZoneSize)
          const speed = Math.min((distance / scrollZoneSize) * maxScrollSpeed, maxScrollSpeed)
          container.scrollTop += speed
          setScrollDirection('down')
        }
        // スクロールエリア外
        else {
          setScrollDirection(null)
        }
      }

      // requestAnimationFrameでスムーズなスクロール
      const animate = () => {
        autoScroll()
        scrollIntervalRef.current = requestAnimationFrame(animate)
      }
      
      scrollIntervalRef.current = requestAnimationFrame(animate)

      return () => {
        if (scrollIntervalRef.current) {
          cancelAnimationFrame(scrollIntervalRef.current)
        }
      }
    }, [isDragging, dragPosition])

    // ドラッグ位置の更新
    useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
          setDragPosition({ x: e.clientX, y: e.clientY })
        }
      }

      if (isDragging) {
        document.addEventListener('mousemove', handleMouseMove)
        return () => {
          document.removeEventListener('mousemove', handleMouseMove)
        }
      }
    }, [isDragging])

    // ドラッグ&ドロップハンドラー
    const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      const genre = e.currentTarget.getAttribute('data-genre') as RankingGenre
      setDraggedGenre(genre)
      setIsDragging(true)
      setDragPosition({ x: e.clientX, y: e.clientY })
      e.dataTransfer.effectAllowed = 'move'
    }, [])

    const handleDragEnd = useCallback(() => {
      setDraggedGenre(null)
      setIsDragging(false)
      setScrollDirection(null)
      if (scrollIntervalRef.current) {
        cancelAnimationFrame(scrollIntervalRef.current)
      }
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }, [])

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const dropGenre = e.currentTarget.getAttribute('data-genre') as RankingGenre
      
      if (draggedGenre && draggedGenre !== dropGenre) {
        moveItem(draggedGenre, dropGenre)
      }
      
      setDraggedGenre(null)
    }, [draggedGenre, moveItem])

    // 外部から呼び出し可能なメソッドを公開
    useImperativeHandle(ref, () => ({
      applyChanges,
      cancelChanges
    }))

    return (
      <div className={styles.container}>
        <p className={styles.description}>
          ドラッグ&ドロップでジャンルの順序を変更したり、表示/非表示を切り替えることができます。
        </p>

        {/* スクロールインジケーター */}
        {isDragging && scrollDirection === 'up' && (
          <div className={styles.scrollIndicatorTop}>
            <span>↑ スクロール中 ↑</span>
          </div>
        )}
        {isDragging && scrollDirection === 'down' && (
          <div className={styles.scrollIndicatorBottom}>
            <span>↓ スクロール中 ↓</span>
          </div>
        )}

        <div className={`${styles.genreList} genreOrderContainer`}>
          {items.map((item) => (
            <GenreItem
              key={item.id}
              genre={item.id}
              isVisible={item.isVisible}
              isDragging={draggedGenre === item.id}
              onToggleVisibility={() => toggleVisibility(item.id)}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          ))}
        </div>

        <div className={styles.helpText}>
          <strong>💡 使い方:</strong>
          <ul>
            <li>☰ ドラッグハンドルを掴んで順序を変更</li>
            <li>👁️ アイコンで表示/非表示を切り替え</li>
            <li>変更は「適用」ボタンで保存されます</li>
          </ul>
        </div>

        <div className={styles.actions}>
          <button 
            className={styles.resetButton}
            onClick={resetToDefault}
          >
            デフォルトに戻す
          </button>
        </div>
      </div>
    )
  }
)

GenreOrderCustomizer.displayName = 'GenreOrderCustomizer'