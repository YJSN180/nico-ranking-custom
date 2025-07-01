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

  const handlePeriodChange = (period: RankingPeriod) => {
    onConfigChange({ ...config, period })
  }

  const handleGenreChange = (genre: RankingGenre) => {
    // ジャンル変更時はタグをリセット
    onConfigChange({ ...config, genre, tag: undefined })
  }

  // 初回マウント時に選択されたジャンルが見えるようにスクロール
  useEffect(() => {
    if (!genreScrollRef.current) return
    
    // 選択されたジャンルのボタンを探す
    const selectedButton = genreScrollRef.current.querySelector(`.${styles.genreButtonSelected}`)
    if (selectedButton && selectedButton instanceof HTMLElement) {
      // ボタンを中央に表示するようにスクロール
      const container = genreScrollRef.current
      const buttonLeft = selectedButton.offsetLeft
      const buttonWidth = selectedButton.offsetWidth
      const containerWidth = container.offsetWidth
      
      // ボタンの中心を計算
      const buttonCenter = buttonLeft + buttonWidth / 2
      // コンテナの中心を計算
      const containerCenter = containerWidth / 2
      // スクロール位置を計算
      const scrollLeft = buttonCenter - containerCenter
      
      // reduced-motion設定を考慮してスクロール
      const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia 
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
        : false
      container.scrollTo({
        left: scrollLeft,
        behavior: prefersReducedMotion ? 'auto' : 'smooth'
      })
    }
  }, []) // 初回マウント時のみ実行

  return (
    <div className={styles.selectorContainer}>
      {/* 期間セレクター */}
      <div>
        <h2 className={styles.selectorTitle}>
          期間
        </h2>
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
        <h2 className={styles.selectorTitle}>
          ジャンル
        </h2>
          <div 
            ref={genreScrollRef}
            className={`${styles.buttonContainer} ${styles.genreScrollContainer}`}
          >
            {(Object.entries(GENRE_LABELS) as [RankingGenre, string][]).map(([value, label]) => (
              <button
                key={value}
                // refを削除（CSS Scroll Snapに任せる）
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