'use client'

import { useState, useEffect, useRef } from 'react'
import type { RankingConfig } from '@/types/ranking-config'
import { useCustomRankings } from '@/hooks/use-custom-rankings'
import { CustomRankingModal } from './custom-ranking-modal'
import styles from './selectors.module.css'

interface TagSelectorProps {
  config: RankingConfig
  onConfigChange: (config: RankingConfig) => void
  popularTags?: string[]
}

export function TagSelector({ config, onConfigChange, popularTags: propsTags = [] }: TagSelectorProps) {
  const [popularTags, setPopularTags] = useState<string[]>(propsTags)
  const [loading, setLoading] = useState(false)
  const [showCustomModal, setShowCustomModal] = useState(false)
  const tagScrollRef = useRef<HTMLDivElement>(null)
  
  // カスタムランキング管理
  const { rankings, selectedId, createRanking, selectRanking } = useCustomRankings()

  // propsから渡されたタグを優先的に使用
  useEffect(() => {
    // propsTagsが変更されたら常に反映
    setPopularTags(propsTags)
    setLoading(false)
  }, [propsTags])

  // 初回マウント時に選択されたタグが見えるようにスクロール
  useEffect(() => {
    if (!tagScrollRef.current || !config.tag) return
    
    // 選択されたタグのボタンを探す
    const selectedButton = tagScrollRef.current.querySelector(`.${styles.tagButtonSelected}`)
    if (selectedButton && selectedButton instanceof HTMLElement) {
      // ボタンを中央に表示するようにスクロール
      const container = tagScrollRef.current
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
      const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
      container.scrollTo({
        left: scrollLeft,
        behavior: prefersReducedMotion ? 'auto' : 'smooth'
      })
    }
  }, [config.tag]) // config.tagが変更されたときに実行

  const handleTagSelect = (tag: string) => {
    if (tag === 'すべて') {
      // 「すべて」を選択した場合はタグをクリア
      onConfigChange({ ...config, tag: undefined })
    } else {
      // タグを選択（同じタグを再度クリックしても維持）
      onConfigChange({ ...config, tag })
    }
  }

  const handleCustomRankingSelect = (customId: string) => {
    selectRanking(customId)
    // カスタムランキングのIDをtagとして設定
    onConfigChange({ ...config, tag: `custom:${customId}` })
  }

  const handleCreateCustomRanking = (data: any) => {
    const newRanking = createRanking({
      title: data.title,
      baseGenre: data.baseGenre,
      conditions: data.conditions
    })
    // 作成したカスタムランキングを自動選択
    handleCustomRankingSelect(newRanking.id)
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
  
  // カスタムジャンルの場合は専用UI
  if (config.genre === 'custom') {
    return (
      <>
        <div className={styles.tagSelectorContainer}>
          <div className={styles.tagHeader}>
            <h2 className={styles.tagTitle}>
              カスタムランキング
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
          
          {config.tag && config.tag.startsWith('custom:') && (
            <div style={{ marginBottom: '12px' }}>
              <span className={styles.selectedTag}>
                選択中: {rankings.find(r => r.id === config.tag?.replace('custom:', ''))?.title || config.tag}
              </span>
            </div>
          )}

          <div className={styles.scrollContainer}>
            <div 
              ref={tagScrollRef}
              className={`${styles.buttonContainer} ${styles.tagScrollContainer}`}
            >
              {/* 新規作成ボタン */}
              <button
                onClick={() => setShowCustomModal(true)}
                className={`${styles.button} ${styles.tagButton} ${styles.createButton}`}
                style={{
                  backgroundColor: 'var(--surface-secondary)',
                  border: '2px dashed var(--border-color)',
                  color: 'var(--primary-color)',
                  fontWeight: '500'
                }}
              >
                ＋ 新しく作成する
              </button>
              
              {/* 既存のカスタムランキング */}
              {rankings.map((ranking) => (
                <button
                  key={ranking.id}
                  onClick={() => handleCustomRankingSelect(ranking.id)}
                  className={`${styles.button} ${styles.tagButton} ${
                    config.tag === `custom:${ranking.id}` ? `${styles.buttonSelected} ${styles.tagButtonSelected}` : ''
                  }`}
                >
                  {ranking.title}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* カスタムランキング作成モーダル */}
        <CustomRankingModal
          isOpen={showCustomModal}
          onClose={() => setShowCustomModal(false)}
          onSave={handleCreateCustomRanking}
          existingTitles={rankings.map(r => r.title)}
        />
      </>
    )
  }
  
  // 通常のジャンルの場合は人気タグを表示
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
        <div 
          ref={tagScrollRef}
          className={`${styles.buttonContainer} ${styles.tagScrollContainer}`}
        >
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