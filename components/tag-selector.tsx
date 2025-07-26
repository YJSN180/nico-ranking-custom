'use client'

import { useState, useEffect, useRef } from 'react'
import type { RankingConfig, RankingGenre } from '@/types/ranking-config'
import type { CustomRanking, CustomRankingFormState } from '@/types/custom-ranking'
import { useCustomRankings } from '@/hooks/use-custom-rankings'
import { useCustomRankingsOrder } from '@/hooks/use-custom-rankings-order'
import { CustomRankingModal } from './custom-ranking-modal'
import { DeleteConfirmationModal } from './delete-confirmation-modal'
import { CustomRankingOrder } from './custom-ranking-order'
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
  const { rankings, selectedId, selectedRanking, createRanking, updateRanking, deleteRanking, selectRanking, isLoading, updateRankingOrder, toggleVisibility } = useCustomRankings()
  
  // カスタムランキング順序管理
  const { getVisibleRankings, moveRanking } = useCustomRankingsOrder(rankings, updateRankingOrder, toggleVisibility)
  const visibleRankings = getVisibleRankings(rankings)
  
  // 編集用の状態
  const [editingRanking, setEditingRanking] = useState<any>(null)
  
  // 削除確認モーダル用の状態
  const [deletingRanking, setDeletingRanking] = useState<any>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

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
    // 選択されたカスタムランキングを取得
    const selectedRanking = rankings.find(r => r.id === customId)
    // eslint-disable-next-line no-console
    console.log('[DEBUG] handleCustomRankingSelect - customId:', customId)
    // eslint-disable-next-line no-console
    console.log('[DEBUG] handleCustomRankingSelect - selectedRanking:', selectedRanking)
    if (!selectedRanking) return
    
    // カスタムランキング選択をCookieに保存
    selectRanking(customId)
    
    // baseGenreへリダイレクト（PRの説明に従って）
    const newConfig = { 
      ...config, 
      genre: selectedRanking.baseGenre, 
      tag: undefined  // タグフィルタリングは将来的に実装予定
    }
    // eslint-disable-next-line no-console
    console.log('[DEBUG] handleCustomRankingSelect - redirecting to baseGenre:', newConfig)
    onConfigChange(newConfig)
  }

  const handleCreateCustomRanking = async (data: CustomRankingFormState) => {
    const newRanking = await createRanking({
      title: data.title,
      baseGenre: data.baseGenre,
      conditions: data.conditions.map((condition, index) => ({
        ...condition,
        orderIndex: index
      }))
    })
    
    // 作成後、baseGenreへリダイレクト
    onConfigChange({ 
      ...config, 
      genre: data.baseGenre, 
      tag: undefined
    })
  }

  const handleEditRanking = (ranking: CustomRanking) => {
    setEditingRanking(ranking)
    setShowCustomModal(true)
  }

  const handleUpdateRanking = (data: CustomRankingFormState) => {
    if (editingRanking) {
      updateRanking(editingRanking.id, {
        title: data.title,
        baseGenre: data.baseGenre,
        conditions: data.conditions.map((condition, index) => ({
          ...condition,
          orderIndex: index
        }))
      })
      setEditingRanking(null)
      
      // 編集後も、baseGenreへリダイレクト
      onConfigChange({ 
        ...config, 
        genre: data.baseGenre, 
        tag: undefined 
      })
    } else {
      handleCreateCustomRanking(data)
    }
  }

  const handleDeleteRanking = (ranking: CustomRanking) => {
    setDeletingRanking(ranking)
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = () => {
    if (deletingRanking) {
      deleteRanking(deletingRanking.id)
      // 削除後は「すべて」ジャンルに戻る
      if (selectedRanking?.id === deletingRanking.id) {
        onConfigChange({ ...config, genre: 'all', tag: undefined })
      }
      setDeletingRanking(null)
    }
  }

  const handleModalClose = () => {
    setShowCustomModal(false)
    setEditingRanking(null)
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
    
    // データ読み込み中の場合はローディング表示
    if (isLoading) {
      return (
        <div className={styles.tagSelectorContainer}>
          <div className={styles.tagHeader}>
            <h2 className={styles.tagTitle}>
              カスタムランキング
            </h2>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px', padding: '20px 0' }}>
            読み込み中...
          </div>
        </div>
      )
    }
    
    // 選択されたカスタムランキングのタグを取得
    const selectedCustomRanking = (() => {
      if (!config.tag?.startsWith('custom:')) return null
      const customId = config.tag.replace('custom:', '')
      return rankings.find(r => r.id === customId) || 
             (selectedRanking?.id === customId ? selectedRanking : null)
    })()
    
    // カスタムランキングのタグを抽出
    const customTags = selectedCustomRanking?.conditions?.map(c => c.tag) || []
    const includeTags = selectedCustomRanking?.conditions
      ?.filter(c => c.operator !== 'NOT') || []
    const excludeTags = selectedCustomRanking?.conditions
      ?.filter(c => c.operator === 'NOT') || []
    
    return (
      <>
        <div className={styles.tagSelectorContainer}>
          <div className={styles.tagHeader}>
            <h2 className={styles.tagTitle}>
              カスタムランキング
            </h2>
            <div className={styles.customRankingActions}>
              <CustomRankingOrder
                rankings={visibleRankings}
                selectedId={config.tag?.replace('custom:', '') || null}
                onSelect={handleCustomRankingSelect}
                onEdit={handleEditRanking}
                onDelete={handleDeleteRanking}
                onMoveRanking={moveRanking}
                isInHeader={true}
              />
            </div>
          </div>
          
          {config.tag && config.tag.startsWith('custom:') && (
            <div style={{ marginBottom: '12px' }}>
              <span className={styles.selectedTag}>
                選択中: {(() => {
                  const customId = config.tag?.replace('custom:', '') || ''
                  
                  // まずrankings配列から検索
                  const foundRanking = rankings.find(r => r.id === customId)
                  
                  // rankings配列で見つからない場合、selectedRankingを確認
                  // (作成直後はselectedRankingに即座に反映されるため)
                  const effectiveRanking = foundRanking || (selectedRanking?.id === customId ? selectedRanking : null)
                  
                  return effectiveRanking?.title || config.tag
                })()}
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
              {visibleRankings.map((ranking) => (
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
        
        {/* 選択されたカスタムランキングのタグを表示 */}
        {selectedCustomRanking && customTags.length > 0 && (
          <div className={styles.tagSelectorContainer} style={{ marginTop: '20px' }}>
            <div className={styles.tagHeader}>
              <h2 className={styles.tagTitle}>
                検索条件
              </h2>
              {selectedCustomRanking && (
                <div className={styles.customRankingActions}>
                  <button
                    onClick={() => handleEditRanking(selectedCustomRanking)}
                    className={styles.actionButton}
                    title="編集"
                  >
                    <span className={styles.actionIcon}>✏️</span>
                    <span className={styles.actionText}>編集</span>
                  </button>
                  <button
                    onClick={() => handleDeleteRanking(selectedCustomRanking)}
                    className={`${styles.actionButton} ${styles.deleteAction}`}
                    title="削除"
                  >
                    <span className={styles.actionIcon}>🗑️</span>
                    <span className={styles.actionText}>削除</span>
                  </button>
                </div>
              )}
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                「{selectedCustomRanking.title}」のタグ条件：
              </span>
            </div>
            
            <div className={styles.scrollContainer}>
              <div 
                className={`${styles.buttonContainer} ${styles.tagScrollContainer}`}
              >
                {/* 含むタグと除外タグを統合して表示 */}
                {selectedCustomRanking.conditions.map((condition, index) => {
                  const isExclude = condition.operator === 'NOT'
                  const operatorColor = condition.operator === 'AND' ? 'var(--success-color)' : 
                                      condition.operator === 'OR' ? 'var(--warning-color)' : 'var(--error-color)'
                  
                  return (
                    <div key={`${condition.tag}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {index > 0 && (
                        <span style={{ 
                          color: operatorColor,
                          fontWeight: 'bold',
                          fontSize: '12px',
                          padding: '0 4px'
                        }}>
                          {condition.operator}
                        </span>
                      )}
                      <button
                        className={`${styles.button} ${styles.tagButton}`}
                        style={{
                          backgroundColor: isExclude ? 'var(--error-bg)' : 'var(--surface-secondary)',
                          borderColor: operatorColor,
                          borderWidth: '2px',
                          cursor: 'default',
                          textDecoration: isExclude ? 'line-through' : 'none'
                        }}
                        disabled
                      >
                        {isExclude && '除外: '}
                        {condition.tag}
                        {condition.tagType !== 'both' && (
                          <span style={{ 
                            fontSize: '10px', 
                            marginLeft: '4px',
                            opacity: 0.7
                          }}>
                            ({condition.tagType === 'lock' ? 'ロック' : 'ユーザー'})
                          </span>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        
        {/* カスタムランキング作成・編集モーダル */}
        <CustomRankingModal
          isOpen={showCustomModal}
          onClose={handleModalClose}
          onSave={handleUpdateRanking}
          existingTitles={rankings.filter(r => r.id !== editingRanking?.id).map(r => r.title)}
          editingRanking={editingRanking}
        />
        
        {/* 削除確認モーダル */}
        <DeleteConfirmationModal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false)
            setDeletingRanking(null)
          }}
          onConfirm={handleConfirmDelete}
          title="カスタムランキングの削除"
          message="このカスタムランキングを削除しますか？"
          itemName={deletingRanking?.title}
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