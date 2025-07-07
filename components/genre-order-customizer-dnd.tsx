'use client'

import { useState, useEffect } from 'react'
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
  onToggleVisibility,
  isDragging
}: DraggableGenreItemProps) {
  return (
    <div
      draggable={!isHidden}
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
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

export function GenreOrderCustomizerDnD({ onChangesUpdate }: GenreOrderCustomizerDnDProps) {
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

  // 現在の設定と一時的な設定を同期
  useEffect(() => {
    setTempOrder(currentOrder)
    setTempHidden(new Set(currentHidden))
    setHasChanges(false)
  }, [currentOrder, currentHidden])

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

  // ドラッグ&ドロップハンドラー
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    
    if (draggedIndex === null || draggedIndex === dropIndex) return
    
    const draggedGenre = allGenres[draggedIndex]
    const dropGenre = allGenres[dropIndex]
    
    // 両方が表示中の場合のみ並び替え可能
    if (!tempHidden.has(draggedGenre) && !tempHidden.has(dropGenre)) {
      const newOrder = [...tempOrder]
      const draggedOrderIndex = newOrder.indexOf(draggedGenre)
      const dropOrderIndex = newOrder.indexOf(dropGenre)
      
      if (draggedOrderIndex !== -1 && dropOrderIndex !== -1) {
        // 順序を入れ替え
        newOrder.splice(draggedOrderIndex, 1)
        newOrder.splice(dropOrderIndex, 0, draggedGenre)
        setTempOrder(newOrder)
      }
    }
    
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
    resetToDefault()
    // リセット後の状態を一時状態に反映
    setTempOrder(currentOrder)
    setTempHidden(new Set(currentHidden))
  }

  // キャンセル処理
  const handleCancel = () => {
    setTempOrder(currentOrder)
    setTempHidden(new Set(currentHidden))
    setHasChanges(false)
    onChangesUpdate?.(false)
  }

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
        
        {hasChanges && (
          <>
            <button 
              onClick={handleCancel}
              style={{
                padding: '8px 16px',
                background: 'var(--surface-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                fontSize: '14px',
                cursor: 'pointer',
                color: 'var(--text-primary)'
              }}
            >
              キャンセル
            </button>
            <button 
              onClick={handleApply}
              style={{
                padding: '8px 16px',
                background: 'var(--primary-color)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              適用
            </button>
          </>
        )}
      </div>
    </div>
  )
}