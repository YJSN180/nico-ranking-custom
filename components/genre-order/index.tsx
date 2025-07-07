'use client'

import React, { forwardRef, useImperativeHandle, useState, useCallback } from 'react'
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
      swapItems,
      toggleVisibility,
      resetToDefault,
      applyChanges,
      cancelChanges
    } = useGenreOrderV2()

    // ドラッグ中のアイテム
    const [draggedGenre, setDraggedGenre] = useState<RankingGenre | null>(null)

    // 変更状態を親に通知
    React.useEffect(() => {
      onChangesUpdate?.(hasChanges)
    }, [hasChanges, onChangesUpdate])

    // ドラッグ&ドロップハンドラー
    const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      const genre = e.currentTarget.getAttribute('data-genre') as RankingGenre
      setDraggedGenre(genre)
      e.dataTransfer.effectAllowed = 'move'
    }, [])

    const handleDragEnd = useCallback(() => {
      setDraggedGenre(null)
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }, [])

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const dropGenre = e.currentTarget.getAttribute('data-genre') as RankingGenre
      
      if (draggedGenre && draggedGenre !== dropGenre) {
        swapItems(draggedGenre, dropGenre)
      }
      
      setDraggedGenre(null)
    }, [draggedGenre, swapItems])

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

        <div className={styles.genreList}>
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
          
          {hasChanges && (
            <div className={styles.buttonGroup}>
              <button 
                className={styles.cancelButton}
                onClick={cancelChanges}
              >
                キャンセル
              </button>
              <button 
                className={styles.applyButton}
                onClick={applyChanges}
              >
                適用
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }
)

GenreOrderCustomizer.displayName = 'GenreOrderCustomizer'