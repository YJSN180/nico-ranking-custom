'use client'

import { useState, useEffect } from 'react'
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


  const clearTag = () => {
    onConfigChange({ ...config, tag: undefined })
  }

  if (loading) {
    return (
      <div className={styles.tagSelectorContainer}>
        <h2 className={styles.tagTitle}>
          人気タグ
        </h2>
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
        <h2 className={styles.tagTitle}>
          人気タグ
        </h2>
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
        <div className={`${styles.buttonContainer} ${styles.tagScrollContainer}`}>
          {/* 「すべて」タグを最初に表示 */}
          <button
            onClick={() => handleTagSelect('すべて')}
            className={`${styles.button} ${styles.tagButton} ${!config.tag ? `${styles.buttonSelected} ${styles.tagButtonSelected}` : ''}`}
          >
            すべて
          </button>
          
          {/* 人気タグを表示 */}
          {popularTags.map((tag) => (
            <button
              key={tag}
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