'use client'

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useGenreOrder } from '@/hooks/use-genre-order'
import { GENRE_LABELS } from '@/types/ranking-config'
import type { RankingGenre } from '@/types/ranking-config'
import styles from './settings-modal.module.css'

interface DraggableGenreItemProps {
  genre: RankingGenre
  index: number
  isHidden: boolean
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (e: React.DragEvent, index: number) => void
  onDragEnd: () => void
  onToggleVisibility: (genre: RankingGenre) => void
  isDragging: boolean
}

function DraggableGenreItem({
  genre,
  index,
  isHidden,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onToggleVisibility,
  isDragging
}: DraggableGenreItemProps) {
  return (
    <div
      draggable={!isHidden}
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      className={`${styles.genreItem} ${isHidden ? styles.genreItemHidden : ''} ${isDragging ? styles.dragging : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px',
        marginBottom: '8px',
        background: isHidden ? 'var(--surface-secondary)' : 'var(--surface-hover)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        opacity: isHidden ? 0.6 : 1,
        cursor: isHidden ? 'default' : 'grab',
        transition: 'all 0.2s ease-in-out',
      }}
    >
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => onToggleVisibility(genre)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '0',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title={isHidden ? '表示する' : '非表示にする'}
        >
          {isHidden ? '👁️‍🗨️' : '👁️'}
        </button>
        {!isHidden && (
          <span style={{ fontSize: '16px', marginRight: '8px' }}>☰</span>
        )}
        <span style={{ fontWeight: 500 }}>{GENRE_LABELS[genre]}</span>
      </div>
    </div>
  )
}

interface GenreOrderCustomizerDnDProps {
  onChangesUpdate?: (hasChanges: boolean) => void
}

export interface GenreOrderCustomizerDnDRef {
  applyChanges: () => void
}

export const GenreOrderCustomizerDnD = forwardRef<GenreOrderCustomizerDnDRef, GenreOrderCustomizerDnDProps>(
  ({ onChangesUpdate }, ref) => {
  const {
    order: currentOrder,
    hidden: currentHidden,
    updateOrder,
    toggleGenreVisibility,
    resetToDefault
  } = useGenreOrder()

  // 一時的な状態
  const [tempOrder, setTempOrder] = useState<RankingGenre[]>(currentOrder)
  const [tempHidden, setTempHidden] = useState<Set<RankingGenre>>(new Set(currentHidden))
  const [hasChanges, setHasChanges] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  
  // 自動スクロール用のref
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const autoScrollIntervalRef = useRef<number | null>(null)

  // 現在の設定と一時的な設定を同期
  useEffect(() => {
    setTempOrder(currentOrder)
    setTempHidden(new Set(currentHidden))
    setHasChanges(false)
  }, [currentOrder, currentHidden])

  // スクロールコンテナの参照を設定
  useEffect(() => {
    // 親要素の.contentクラスを持つ要素を探す（CSS Modulesのクラス名を考慮）
    const contentElement = document.querySelector('[class*="content"]') as HTMLDivElement
    if (contentElement) {
      scrollContainerRef.current = contentElement
    }
    
    // クリーンアップ
    return () => {
      stopAutoScroll()
    }
  }, [])

  // 変更検知
  useEffect(() => {
    const orderChanged = JSON.stringify(tempOrder) !== JSON.stringify(currentOrder)
    const hiddenChanged = tempHidden.size !== currentHidden.size || 
      [...tempHidden].some(genre => !currentHidden.has(genre))
    const changed = orderChanged || hiddenChanged
    setHasChanges(changed)
    onChangesUpdate?.(changed)
  }, [tempOrder, tempHidden, currentOrder, currentHidden, onChangesUpdate])

  // すべてのジャンル（表示・非表示含む）
  const allGenres = tempOrder.concat(
    Object.keys(GENRE_LABELS).filter(
      genre => !tempOrder.includes(genre as RankingGenre)
    ) as RankingGenre[]
  )

  // 自動スクロール機能
  const startAutoScroll = (e: React.DragEvent) => {
    if (!scrollContainerRef.current) return

    const scrollContainer = scrollContainerRef.current
    const containerRect = scrollContainer.getBoundingClientRect()
    const mouseY = e.clientY

    // スクロールゾーンのサイズ（上下150px）
    const scrollZoneSize = 150
    const scrollSpeed = 10

    // 上部スクロールゾーン
    if (mouseY < containerRect.top + scrollZoneSize) {
      const distance = containerRect.top + scrollZoneSize - mouseY
      const speed = (distance / scrollZoneSize) * scrollSpeed
      
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current)
      }
      
      autoScrollIntervalRef.current = window.setInterval(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop -= speed
        }
      }, 16) // 約60fps
    }
    // 下部スクロールゾーン
    else if (mouseY > containerRect.bottom - scrollZoneSize) {
      const distance = mouseY - (containerRect.bottom - scrollZoneSize)
      const speed = (distance / scrollZoneSize) * scrollSpeed
      
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current)
      }
      
      autoScrollIntervalRef.current = window.setInterval(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop += speed
        }
      }, 16) // 約60fps
    }
    // スクロールゾーン外
    else {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current)
        autoScrollIntervalRef.current = null
      }
    }
  }

  const stopAutoScroll = () => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current)
      autoScrollIntervalRef.current = null
    }
  }

  // ドラッグ&ドロップハンドラー
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    
    // 非表示ジャンルへのドロップは禁止
    const dropGenre = allGenres[index]
    if (tempHidden.has(dropGenre)) {
      e.dataTransfer.dropEffect = 'none'
      return
    }
    
    e.dataTransfer.dropEffect = 'move'
    startAutoScroll(e)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    stopAutoScroll()
    
    if (draggedIndex === null || draggedIndex === dropIndex) return
    
    const draggedGenre = allGenres[draggedIndex]
    const dropGenre = allGenres[dropIndex]
    
    // 非表示ジャンルへのドロップは禁止
    if (tempHidden.has(dropGenre)) {
      setDraggedIndex(null)
      return
    }
    
    // ドラッグ&ドロップによる位置移動処理
    if (draggedGenre !== dropGenre) {
      // 表示/非表示状態は変更しない - ドラッグしたジャンルの状態を保持
      // 順序のみ変更：ドラッグしたジャンルをドロップ位置に移動
      const newOrder = [...tempOrder]
      const draggedOrderIndex = newOrder.indexOf(draggedGenre)
      const dropOrderIndex = newOrder.indexOf(dropGenre)
      
      if (draggedOrderIndex !== -1 && dropOrderIndex !== -1) {
        // ドラッグしたアイテムを配列から削除
        const [movedItem] = newOrder.splice(draggedOrderIndex, 1)
        
        // ドロップ位置に挿入
        // 削除によってインデックスが変わるため調整
        const adjustedDropIndex = draggedOrderIndex < dropOrderIndex ? dropOrderIndex - 1 : dropOrderIndex
        newOrder.splice(adjustedDropIndex, 0, movedItem)
        
        setTempOrder(newOrder)
      }
    }
    
    setDraggedIndex(null)
  }

  const handleDragEnd = () => {
    stopAutoScroll()
    setDraggedIndex(null)
  }

  // 表示/非表示の切り替え（一時的）
  const handleToggleVisibility = (genre: RankingGenre) => {
    const newHidden = new Set(tempHidden)
    if (newHidden.has(genre)) {
      newHidden.delete(genre)
    } else {
      newHidden.add(genre)
    }
    setTempHidden(newHidden)
  }

  // 適用処理
  const handleApply = () => {
    // 現在の設定を更新
    updateOrder(tempOrder)
    
    // 表示/非表示の更新
    currentHidden.forEach(genre => {
      if (!tempHidden.has(genre)) {
        toggleGenreVisibility(genre)
      }
    })
    tempHidden.forEach(genre => {
      if (!currentHidden.has(genre)) {
        toggleGenreVisibility(genre)
      }
    })
    
    setHasChanges(false)
    onChangesUpdate?.(false)
  }

  // リセット処理
  const handleReset = () => {
    // デフォルト状態を一時状態に設定
    const DEFAULT_ORDER: RankingGenre[] = [
      'all', 'game', 'anime', 'vocaloid', 'voicesynthesis', 'entertainment',
      'music', 'sing', 'dance', 'play', 'commentary', 'cooking',
      'travel', 'nature', 'vehicle', 'technology', 'society', 'mmd',
      'vtuber', 'radio', 'sports', 'animal', 'other'
    ]
    setTempOrder(DEFAULT_ORDER)
    setTempHidden(new Set<RankingGenre>())
    // 変更フラグを強制的に設定
    setHasChanges(true)
    onChangesUpdate?.(true)
  }

  // キャンセル処理
  const handleCancel = () => {
    setTempOrder(currentOrder)
    setTempHidden(new Set(currentHidden))
    setHasChanges(false)
    onChangesUpdate?.(false)
  }
  
  // 外部から呼び出し可能なメソッドを公開
  useImperativeHandle(ref, () => ({
    applyChanges: handleApply
  }))

  return (
    <div className={styles.genreOrderSettings}>
      <div style={{ marginBottom: '16px' }}>
        <p style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>
          ドラッグ&ドロップでジャンルを並び替えできます。
        </p>
      </div>

      <div className={styles.genreList}>
        {allGenres.map((genre, index) => {
          const isHidden = tempHidden.has(genre)
          
          return (
            <DraggableGenreItem
              key={genre}
              genre={genre}
              index={index}
              isHidden={isHidden}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onToggleVisibility={handleToggleVisibility}
              isDragging={draggedIndex === index}
            />
          )
        })}
      </div>

      <div style={{ 
        marginTop: '16px', 
        padding: '12px', 
        background: 'var(--info-bg)', 
        borderRadius: '4px',
        fontSize: '14px',
        color: 'var(--text-secondary)'
      }}>
        <p style={{ margin: 0 }}>
          💡 ヒント: 
        </p>
        <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
          <li>👁️ アイコンをクリックして表示/非表示を切り替え</li>
          <li>☰ ドラッグハンドルを掴んで順序を変更</li>
          <li>非表示のジャンルは下部に表示されます</li>
        </ul>
      </div>

      <div style={{ 
        marginTop: '16px', 
        display: 'flex', 
        gap: '8px',
        justifyContent: 'flex-end'
      }}>
        <button 
          onClick={handleReset}
          className={styles.resetButton}
          style={{
            padding: '8px 16px',
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            fontSize: '14px',
            cursor: 'pointer',
            color: 'var(--text-secondary)'
          }}
        >
          デフォルトに戻す
        </button>
      </div>
    </div>
  )
})

GenreOrderCustomizerDnD.displayName = 'GenreOrderCustomizerDnD'