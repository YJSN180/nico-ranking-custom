'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { RankingGenre, GENRE_LABELS } from '@/types/ranking-config'
import styles from './genre-order.module.css'

interface SortableGenreItemProps {
  genre: RankingGenre
  isVisible: boolean
  onToggleVisibility: () => void
}

export function SortableGenreItem({ genre, isVisible, onToggleVisibility }: SortableGenreItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: genre })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.genreItem} ${!isVisible ? styles.hidden : ''} ${isDragging ? styles.dragging : ''}`}
      data-genre={genre}
      {...attributes}
    >
      {/* ドラッグハンドル */}
      <div className={styles.dragHandle} {...listeners}>
        <span className={styles.dragIcon}>☰</span>
      </div>
      
      <div className={styles.genreLabel}>
        {GENRE_LABELS[genre]}
      </div>
      
      {/* 表示/非表示ボタンはドラッグ対象外 */}
      <button
        className={styles.visibilityToggle}
        onClick={onToggleVisibility}
        title={isVisible ? '非表示にする' : '表示する'}
        aria-label={isVisible ? `${GENRE_LABELS[genre]}を非表示にする` : `${GENRE_LABELS[genre]}を表示する`}
      >
        {isVisible ? '👁️' : '👁️‍🗨️'}
      </button>
    </div>
  )
}