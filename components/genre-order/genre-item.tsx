'use client'

import React from 'react'
import { RankingGenre } from '@/types/ranking-config'
import { GENRE_LABELS } from '@/types/ranking-config'
import styles from './genre-order.module.css'

interface GenreItemProps {
  genre: RankingGenre
  isVisible: boolean
  onToggleVisibility: () => void
  isDragging?: boolean
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  onTouchStart?: (e: React.TouchEvent<HTMLDivElement>) => void
  onTouchMove?: (e: React.TouchEvent<HTMLDivElement>) => void
  onTouchEnd?: (e: React.TouchEvent<HTMLDivElement>) => void
}

export const GenreItem = React.memo(function GenreItem({
  genre,
  isVisible,
  onToggleVisibility,
  isDragging = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onTouchStart,
  onTouchMove,
  onTouchEnd
}: GenreItemProps) {
  return (
    <div 
      className={`${styles.genreItem} ${!isVisible ? styles.hidden : ''} ${isDragging ? styles.dragging : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      data-genre={genre}
    >
      <div className={styles.dragHandle}>
        <span className={styles.dragIcon}>☰</span>
      </div>
      
      <div className={styles.genreLabel}>
        {GENRE_LABELS[genre]}
      </div>
      
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
})