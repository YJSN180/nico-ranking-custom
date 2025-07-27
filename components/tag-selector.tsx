'use client'

import { useState, useRef, useCallback } from 'react'
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
  onCreateCustomRankingWithFilter?: (rankingId: string, baseGenre: RankingGenre, conditions: any[], title: string) => Promise<void> // 作成時フィルタリング用コールバック
  onPrefetchData?: (baseGenre: RankingGenre, period: string) => Promise<void> // データプリフェッチ用
  currentPeriod?: string // 現在の期間設定
}

export function TagSelector({ config, onConfigChange, popularTags: propsTags = [], onCreateCustomRankingWithFilter, onPrefetchData, currentPeriod }: TagSelectorProps) {
  const [showCustomModal, setShowCustomModal] = useState(false)
  const tagScrollRef = useRef<HTMLDivElement>(null)
  const lastSelectedCustomIdRef = useRef<string | null>(null)
  const hasRestoredCustomRanking = useRef(false)
  
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
  
  // 並び替えモード用の状態
  const [isReorderingMode, setIsReorderingMode] = useState(false)
  

  // propsを直接使用（stateへのコピーは不要）
  const popularTags = propsTags
  const loading = false // 常にfalse（propsで管理）

  // スクロール処理をコールバックrefで実装（useEffect不要）
  const scrollToSelectedTag = useCallback((node: HTMLDivElement | null) => {
    if (!node || !config.tag) return
    
    // 次のフレームで実行（DOMが更新された後）
    requestAnimationFrame(() => {
      const selectedButton = node.querySelector(`.${styles.tagButtonSelected}`)
      if (selectedButton && selectedButton instanceof HTMLElement) {
        const buttonLeft = selectedButton.offsetLeft
        const buttonWidth = selectedButton.offsetWidth
        const containerWidth = node.offsetWidth
        
        const buttonCenter = buttonLeft + buttonWidth / 2
        const containerCenter = containerWidth / 2
        const scrollLeft = buttonCenter - containerCenter
        
        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        node.scrollTo({
          left: scrollLeft,
          behavior: prefersReducedMotion ? 'auto' : 'smooth'
        })
      }
    })
    
    // refを保存
    tagScrollRef.current = node
  }, [config.tag])

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
    if (!selectedRanking) return
    
    // LocalStorageに保存（クライアントサイドのみ）
    if (typeof window !== 'undefined') {
      localStorage.setItem('lastSelectedCustomRankingId', customId)
      lastSelectedCustomIdRef.current = customId
    }
    
    // genre='custom'のまま、tagにカスタムランキングIDを設定
    const newConfig = { 
      ...config, 
      genre: 'custom' as RankingGenre, 
      tag: `custom:${customId}`
    }
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
    
    // LocalStorageに保存（クライアントサイドのみ）
    if (typeof window !== 'undefined') {
      localStorage.setItem('lastSelectedCustomRankingId', newRanking)
      lastSelectedCustomIdRef.current = newRanking
    }
    
    // 作成と同時にフィルタリングを実行（改修版：titleパラメータ追加）
    if (onCreateCustomRankingWithFilter && data.baseGenre) {
      await onCreateCustomRankingWithFilter(newRanking, data.baseGenre, data.conditions, data.title)
    }
    
    // 作成後、genre='custom'でそのカスタムランキングを選択（遅延実行で専用状態を優先）
    setTimeout(() => {
      onConfigChange({ 
        ...config, 
        genre: 'custom' as RankingGenre, 
        tag: `custom:${newRanking}`
      })
    }, 100) // 100ms遅延でフィルタリング表示を優先
  }

  const handleEditRanking = (ranking: CustomRanking) => {
    setEditingRanking(ranking)
    setShowCustomModal(true)
  }

  const handleUpdateRanking = async (data: CustomRankingFormState) => {
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
      
      // 編集時も即時フィルタリングを実行（改修版：titleパラメータ追加）
      if (onCreateCustomRankingWithFilter && data.baseGenre) {
        await onCreateCustomRankingWithFilter(editingRanking.id, data.baseGenre, data.conditions, data.title)
      }
      
      // 編集後も、genre='custom'でそのカスタムランキングを選択（遅延実行で専用状態を優先）
      setTimeout(() => {
        onConfigChange({ 
          ...config, 
          genre: 'custom' as RankingGenre, 
          tag: `custom:${editingRanking.id}` 
        })
      }, 100) // 100ms遅延でフィルタリング表示を優先
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
      // 削除後はカスタムジャンル（タグ未選択状態）に戻る
      if (config.genre === 'custom' && config.tag === `custom:${deletingRanking.id}`) {
        // LocalStorageからも削除（クライアントサイドのみ）
        if (typeof window !== 'undefined') {
          localStorage.removeItem('lastSelectedCustomRankingId')
          lastSelectedCustomIdRef.current = null
        }
        onConfigChange({ ...config, genre: 'custom', tag: undefined })
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

  // カスタムランキングの自動復元（レンダリング時の計算として実装）
  if (typeof window !== 'undefined' && 
      config.genre === 'custom' && 
      !config.tag && 
      !isLoading && 
      !hasRestoredCustomRanking.current &&
      rankings.length > 0) {
    const savedCustomId = localStorage.getItem('lastSelectedCustomRankingId')
    if (savedCustomId && rankings.find(r => r.id === savedCustomId)) {
      hasRestoredCustomRanking.current = true
      // 次のレンダリングサイクルで実行
      Promise.resolve().then(() => {
        handleCustomRankingSelect(savedCustomId)
      })
    }
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
            <button
              className={styles.clearButton}
              onClick={() => setIsReorderingMode(!isReorderingMode)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                padding: '6px 12px'
              }}
            >
              {isReorderingMode ? (
                <>完了</>
              ) : (
                <>
                  <span>↕️</span>
                  <span>並び替え・編集</span>
                </>
              )}
            </button>
          </div>
          
          {/* カスタムランキング並び替えボタン */}
          <CustomRankingOrder
            rankings={visibleRankings}
            selectedId={config.tag?.replace('custom:', '') || null}
            onSelect={handleCustomRankingSelect}
            onEdit={handleEditRanking}
            onDelete={handleDeleteRanking}
            onMoveRanking={moveRanking}
            isReordering={isReorderingMode}
            onReorderModeChange={setIsReorderingMode}
          />
          
          {!isReorderingMode && config.tag && config.tag.startsWith('custom:') && (
            <div style={{ marginTop: '24px', marginBottom: '16px' }}>
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

          {!isReorderingMode && (
            <div className={styles.scrollContainer}>
              <div 
                ref={scrollToSelectedTag}
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
          )}
        </div>
        
        {/* 選択されたカスタムランキングのタグを表示 */}
        {!isReorderingMode && selectedCustomRanking && customTags.length > 0 && (
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
          onPrefetchData={onPrefetchData}
          currentPeriod={currentPeriod}
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
          ref={scrollToSelectedTag}
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