'use client'

import { useRef, useEffect } from 'react'
import { GENRE_LABELS, PERIOD_LABELS } from '@/types/ranking-config'
import type { RankingGenre, RankingPeriod, RankingConfig } from '@/types/ranking-config'
import styles from './selectors.module.css'

interface RankingSelectorProps {
  config: RankingConfig
  onConfigChange: (config: RankingConfig) => void
}

export function RankingSelector({ config, onConfigChange }: RankingSelectorProps) {
  const genreScrollRef = useRef<HTMLDivElement>(null)
  const selectedGenreRef = useRef<HTMLButtonElement>(null)

  const handlePeriodChange = (period: RankingPeriod) => {
    onConfigChange({ ...config, period })
  }

  const handleGenreChange = (genre: RankingGenre) => {
    // ジャンル変更時はタグをリセット
    onConfigChange({ ...config, genre, tag: undefined })
  }

  // 選択されたジャンルを中央にスクロール（モバイルのみ）
  useEffect(() => {
    if (selectedGenreRef.current && genreScrollRef.current) {
      const container = genreScrollRef.current
      const selected = selectedGenreRef.current
      
      // モバイルかどうかをCSSメディアクエリで判定
      const isMobile = window.matchMedia('(max-width: 640px)').matches
      
      if (isMobile) {
        const containerWidth = container.offsetWidth
        const selectedLeft = selected.offsetLeft
        const selectedWidth = selected.offsetWidth
        const scrollPosition = selectedLeft - (containerWidth / 2) + (selectedWidth / 2)
        
        container.scrollTo({ left: scrollPosition, behavior: 'smooth' })
      }
    }
  }, [config.genre])

  return (
    <div className={styles.selectorContainer}>
      {/* 期間セレクター */}
      <div>
        <h3 className={styles.selectorTitle}>
          期間
        </h3>
        <div className={styles.buttonContainer}>
          {(Object.entries(PERIOD_LABELS) as [RankingPeriod, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => handlePeriodChange(value)}
              className={`${styles.button} ${config.period === value ? styles.buttonSelected : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ジャンルセレクター */}
      <div>
        <h3 className={styles.selectorTitle}>
          ジャンル
        </h3>
          <div 
            ref={genreScrollRef}
            className={styles.buttonContainer}
          >
            {(Object.entries(GENRE_LABELS) as [RankingGenre, string][]).map(([value, label]) => (
              <button
                key={value}
                ref={config.genre === value ? selectedGenreRef : null}
                onClick={() => handleGenreChange(value)}
                className={`${styles.button} ${styles.genreButton} ${config.genre === value ? `${styles.buttonSelected} ${styles.genreButtonSelected}` : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
      </div>
    </div>
  )
}