'use client'

import React, { forwardRef, useImperativeHandle, useState } from 'react'
import {
  DndContext,
  closestCenter,
  TouchSensor,
  MouseSensor,
  KeyboardSensor,
  useSensors,
  useSensor,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useGenreOrderV2 } from '@/hooks/use-genre-order-v2'
import { RankingGenre, GENRE_LABELS } from '@/types/ranking-config'
import { SortableGenreItem } from './sortable-genre-item'
import { GenreItemOverlay } from './genre-item-overlay'
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
      hideAll,
      showAll,
      applyChanges,
      cancelChanges,
    } = useGenreOrderV2()

    const [activeId, setActiveId] = useState<RankingGenre | null>(null)

    // 複数のセンサーを設定（マウス、タッチ、キーボード）
    const sensors = useSensors(
      // PC用マウスセンサー
      useSensor(MouseSensor, {
        activationConstraint: {
          distance: 10, // 10px移動でドラッグ開始
        },
      }),
      // モバイル・タブレット用タッチセンサー
      useSensor(TouchSensor, {
        activationConstraint: {
          delay: 125,     // 125ms長押しでドラッグ開始（250ms → 125msに短縮）
          tolerance: 5,   // 5pxの手ブレは許容
        },
      }),
      // キーボードアクセシビリティ
      useSensor(KeyboardSensor, {
        coordinateGetter: sortableKeyboardCoordinates,
      })
    )

    // 変更状態を親に通知
    React.useEffect(() => {
      onChangesUpdate?.(hasChanges)
    }, [hasChanges, onChangesUpdate])

    // 外部から呼び出し可能なメソッドを公開
    useImperativeHandle(ref, () => ({
      applyChanges,
      cancelChanges,
    }))

    const handleDragStart = (event: DragStartEvent) => {
      setActiveId(event.active.id as RankingGenre)
      
      // モバイルデバイスで振動フィードバック
      if ('vibrate' in navigator && event.activatorEvent?.type?.includes('touch')) {
        navigator.vibrate(50)
      }
    }

    const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event
      
      if (over && active.id !== over.id) {
        moveItem(active.id as RankingGenre, over.id as RankingGenre)
      }
      
      setActiveId(null)
    }

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        // 自動スクロール設定
        autoScroll={{
          threshold: { x: 0.2, y: 0.2 },  // 画面端20%でスクロール
          acceleration: 5,
          interval: 10,
        }}
      >
        <div className={styles.container}>
          <p className={styles.description}>
            ドラッグ&ドロップでジャンルの順序を変更したり、表示/非表示を切り替えることができます。
            <br />
            <small className={styles.helpTextSmall}>
              💡 モバイル: 長押ししてドラッグ | PC: クリックしてドラッグ
            </small>
          </p>

          <SortableContext
            items={items.map(item => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className={`${styles.genreList} genreOrderContainer`}>
              {items.map((item) => (
                <SortableGenreItem
                  key={item.id}
                  genre={item.id}
                  isVisible={item.isVisible}
                  onToggleVisibility={() => toggleVisibility(item.id)}
                />
              ))}
            </div>
          </SortableContext>

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
            <button
              className={styles.resetButton}
              onClick={showAll}
            >
              すべて表示にする
            </button>
            <button
              className={styles.resetButton}
              onClick={hideAll}
            >
              すべて非表示にする
            </button>
          </div>
        </div>

        {/* ドラッグ中のオーバーレイ */}
        <DragOverlay>
          {activeId ? (
            <GenreItemOverlay genre={activeId} />
          ) : null}
        </DragOverlay>
      </DndContext>
    )
  }
)

GenreOrderCustomizer.displayName = 'GenreOrderCustomizer'