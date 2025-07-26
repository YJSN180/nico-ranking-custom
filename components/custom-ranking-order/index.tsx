'use client'

import React, { useState } from 'react'
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
import { SortableCustomRankingItem } from './sortable-custom-ranking-item'
import styles from './custom-ranking-order.module.css'

interface CustomRankingOrderProps {
  rankings: any[]
  selectedId: string | null
  onSelect: (id: string) => void
  onEdit: (ranking: any) => void
  onDelete: (ranking: any) => void
  onMoveRanking: (fromId: string, toId: string) => void
  onToggleVisibility: (id: string) => void
}

export function CustomRankingOrder({
  rankings,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onMoveRanking,
  onToggleVisibility
}: CustomRankingOrderProps) {
  const [isReordering, setIsReordering] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  
  // 親から渡されたランキングをそのまま使用（二重ソートを避ける）
  const sortedRankings = rankings

  // センサー設定（マウス、タッチ、キーボード）
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 125,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    
    // モバイルで振動フィードバック
    if ('vibrate' in navigator && event.activatorEvent?.type?.includes('touch')) {
      navigator.vibrate(50)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    
    if (over && active.id !== over.id) {
      onMoveRanking(active.id as string, over.id as string)
    }
    
    setActiveId(null)
  }

  const activeRanking = activeId ? sortedRankings.find(r => r.id === activeId) : null

  if (sortedRankings.length === 0) {
    return null
  }

  // 並び替えモード
  if (isReordering) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>カスタムランキングの並び替え</h3>
          <button
            className={styles.reorderButton}
            onClick={() => setIsReordering(false)}
          >
            完了
          </button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedRankings.map(r => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className={styles.reorderList}>
              {sortedRankings.map((ranking) => (
                <SortableCustomRankingItem
                  key={ranking.id}
                  id={ranking.id}
                  title={ranking.title}
                  isSelected={ranking.id === selectedId}
                  isVisible={ranking.isVisible}
                  onSelect={() => onSelect(ranking.id)}
                  onEdit={() => onEdit(ranking)}
                  onDelete={() => onDelete(ranking)}
                  onToggleVisibility={() => onToggleVisibility(ranking.id)}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeRanking ? (
              <div className={styles.itemOverlay}>
                <span className={styles.overlayHandle}>☰</span>
                <span className={styles.overlayTitle}>{activeRanking.title}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        <div className={styles.helpText}>
          ドラッグ&ドロップで順序を変更できます
        </div>
      </div>
    )
  }

  // 通常表示モード（並び替えボタンを表示）
  return (
    <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'flex-end' }}>
      <button
        className={styles.reorderButton}
        onClick={() => setIsReordering(true)}
      >
        <span>↕️</span>
        <span>並び替え</span>
      </button>
    </div>
  )
}