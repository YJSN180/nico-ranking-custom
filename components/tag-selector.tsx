'use client'

import { useState, useEffect, useRef } from 'react'
import type { RankingConfig } from '@/types/ranking-config'
import styles from './selectors.module.css'

interface TagSelectorProps {
  config: RankingConfig
  onConfigChange: (config: RankingConfig) => void
  popularTags?: string[]
}

export function TagSelector({ config, onConfigChange, popularTags: propsTags = [] }: TagSelectorProps) {
  const [popularTags, setPopularTags] = useState<string[]>(propsTags)
  const [loading, setLoading] = useState(false)
  const tagScrollRef = useRef<HTMLDivElement>(null)
  const selectedTagRef = useRef<HTMLButtonElement>(null)

  // propsから渡されたタグを優先的に使用
  useEffect(() => {
    // propsTagsが変更されたら常に反映
    setPopularTags(propsTags)
    setLoading(false)
  }, [propsTags])

  const handleTagSelect = (tag: string) => {
    if (tag === 'すべて') {
      // 「すべて」を選択した場合はタグをクリア
      onConfigChange({ ...config, tag: undefined })
    } else {
      // タグを選択（同じタグを再度クリックしても維持）
      onConfigChange({ ...config, tag })
    }
  }

  // 選択されたタグを中央にスクロール（モバイルのみ）
  useEffect(() => {
    if (selectedTagRef.current && tagScrollRef.current) {
      const container = tagScrollRef.current
      const selected = selectedTagRef.current
      
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
  }, [config.tag])

  const clearTag = () => {
    onConfigChange({ ...config, tag: undefined })
  }

  if (loading) {
    return (
      <div className={styles.tagSelectorContainer}>
        <h3 className={styles.tagTitle}>
          人気タグ
        </h3>
        <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          タグを読み込み中...
        </div>
      </div>
    )
  }

  // 総合ジャンルの場合は人気タグセクションを表示しない
  if (config.genre === 'all') {
    return null
  }
  
  // 常に表示（「すべて」タグを含める）
  return (
    <div className={styles.tagSelectorContainer}>
      <div className={styles.tagHeader}>
        <h3 className={styles.tagTitle}>
          人気タグ
        </h3>
        {config.tag && (
          <button
            onClick={clearTag}
            className={styles.clearButton}
          >
            クリア
          </button>
        )}
      </div>
      
      {config.tag && (
        <div style={{ marginBottom: '12px' }}>
          <span className={styles.selectedTag}>
            選択中: {config.tag}
          </span>
        </div>
      )}

      <div className={styles.scrollContainer}>
        <div
          ref={tagScrollRef}
          className={styles.buttonContainer}
        >
          {/* 「すべて」タグを最初に表示 */}
          <button
            ref={!config.tag ? selectedTagRef : null}
            onClick={() => handleTagSelect('すべて')}
            className={`${styles.button} ${styles.tagButton} ${!config.tag ? `${styles.buttonSelected} ${styles.tagButtonSelected}` : ''}`}
          >
            すべて
          </button>
          
          {/* 人気タグを表示 */}
          {popularTags.map((tag) => (
            <button
              key={tag}
              ref={config.tag === tag ? selectedTagRef : null}
              onClick={() => handleTagSelect(tag)}
              className={`${styles.button} ${styles.tagButton} ${config.tag === tag ? `${styles.buttonSelected} ${styles.tagButtonSelected}` : ''}`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}