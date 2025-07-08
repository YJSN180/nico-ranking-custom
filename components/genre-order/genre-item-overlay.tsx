'use client'

import React from 'react'
import { RankingGenre, GENRE_LABELS } from '@/types/ranking-config'
import styles from './genre-order.module.css'

interface GenreItemOverlayProps {
  genre: RankingGenre
}

// ドラッグオーバーレイ用のコンポーネント
export function GenreItemOverlay({ genre }: GenreItemOverlayProps) {
  return (
    <div className={`${styles.genreItem} ${styles.dragOverlay}`}>
      <div className={styles.dragHandle}>
        <span className={styles.dragIcon}>☰</span>
      </div>
      <div className={styles.genreLabel}>
        {GENRE_LABELS[genre]}
      </div>
      <div className={styles.visibilityToggle} style={{ opacity: 0.5 }}>
        👁️
      </div>
    </div>
  )
}