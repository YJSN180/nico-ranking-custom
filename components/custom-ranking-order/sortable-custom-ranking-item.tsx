'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import styles from './custom-ranking-order.module.css'

interface SortableCustomRankingItemProps {
  id: string
  title: string
  isSelected: boolean
  isVisible: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}

export function SortableCustomRankingItem({
  id,
  title,
  isSelected,
  isVisible,
  onSelect,
  onEdit,
  onDelete
}: SortableCustomRankingItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.customRankingItem} ${isDragging ? styles.dragging : ''} ${isSelected ? styles.selected : ''}`}
    >
      {/* ドラッグハンドル */}
      <button
        className={styles.dragHandle}
        {...attributes}
        {...listeners}
        aria-label="ドラッグして順序を変更"
      >
        ☰
      </button>

      {/* ランキングタイトル */}
      <button
        className={styles.rankingTitle}
        onClick={onSelect}
      >
        {title}
      </button>

      {/* アクションボタン */}
      <div className={styles.actions}>
        <button
          className={styles.actionButton}
          onClick={onEdit}
          title="編集"
        >
          <span className={styles.actionIcon}>✏️</span>
          <span className={styles.actionText}>編集</span>
        </button>
        <button
          className={`${styles.actionButton} ${styles.deleteAction}`}
          onClick={onDelete}
          title="削除"
        >
          <span className={styles.actionIcon}>🗑️</span>
          <span className={styles.actionText}>削除</span>
        </button>
      </div>
    </div>
  )
}