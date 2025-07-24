'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { BackLink } from '@/components/back-link'
import { TagConditionBuilder } from '@/components/tag-condition-builder'
import { CustomRankingCard } from './components/custom-ranking-card'
import { useCustomTagRankings } from '@/hooks/use-custom-tag-rankings'
import { useTagSuggestions } from '@/hooks/use-tag-suggestions'
import type { CustomTagConditions, CustomTagRanking } from '@/types/custom-tag-ranking'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import styles from './custom-rankings.module.css'

export function CustomRankingsClient() {
  const router = useRouter()
  const { rankings, isLoading, createRanking, updateRanking, deleteRanking } = useCustomTagRankings()
  
  // 作成モーダルの状態
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedGenre, setSelectedGenre] = useState<RankingGenre>('all')
  const [selectedPeriod, setSelectedPeriod] = useState<RankingPeriod>('24h')
  const [conditions, setConditions] = useState<CustomTagConditions>({
    and: [],
    or: [],
    not: []
  })
  const [rankingName, setRankingName] = useState('')
  
  // 編集中のランキング
  const [editingRanking, setEditingRanking] = useState<CustomTagRanking | null>(null)
  
  // タグ候補
  const { suggestions, getFilteredSuggestions } = useTagSuggestions(selectedGenre, selectedPeriod)
  
  // ランキング作成/更新
  const handleSaveRanking = useCallback(() => {
    if (!rankingName.trim()) {
      alert('ランキング名を入力してください')
      return
    }
    
    if (conditions.and.length === 0 && conditions.or.length === 0 && conditions.not.length === 0) {
      alert('少なくとも1つのタグ条件を設定してください')
      return
    }
    
    if (editingRanking) {
      // 更新
      updateRanking(editingRanking.id, {
        name: rankingName,
        genre: selectedGenre,
        period: selectedPeriod,
        conditions
      })
    } else {
      // 新規作成
      createRanking(rankingName, selectedGenre, selectedPeriod, conditions)
    }
    
    // リセット
    setShowCreateModal(false)
    setEditingRanking(null)
    setRankingName('')
    setConditions({ and: [], or: [], not: [] })
  }, [rankingName, selectedGenre, selectedPeriod, conditions, editingRanking, createRanking, updateRanking])
  
  // ランキング編集開始
  const handleEditRanking = useCallback((ranking: CustomTagRanking) => {
    setEditingRanking(ranking)
    setRankingName(ranking.name)
    setSelectedGenre(ranking.genre)
    setSelectedPeriod(ranking.period)
    setConditions(ranking.conditions)
    setShowCreateModal(true)
  }, [])
  
  // ランキング削除
  const handleDeleteRanking = useCallback((ranking: CustomTagRanking) => {
    if (confirm(`「${ranking.name}」を削除しますか？`)) {
      deleteRanking(ranking.id)
    }
  }, [deleteRanking])
  
  // ランキング表示
  const handleViewRanking = useCallback((ranking: CustomTagRanking) => {
    router.push(`/custom-rankings/${ranking.id}`)
  }, [router])
  
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>読み込み中...</div>
      </div>
    )
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.headerTop}>
        <BackLink />
      </div>
      
      <div className={styles.header}>
        <h1 className={styles.title}>カスタムタグランキング</h1>
        <p className={styles.description}>
          タグ条件を組み合わせて自分だけのランキングを作成できます
        </p>
      </div>
      
      {/* 作成フォーム */}
      <div className={styles.createSection}>
        <h2 className={styles.sectionTitle}>新規作成</h2>
        
        <div className={styles.formGroup}>
          <div className={styles.selectors}>
            <div className={styles.selectGroup}>
              <label className={styles.label}>ジャンル</label>
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value as RankingGenre)}
                className={styles.select}
              >
                <option value="all">すべて</option>
                <option value="game">ゲーム</option>
                <option value="anime">アニメ</option>
                <option value="entertainment">エンターテイメント</option>
                <option value="technology">科学・技術</option>
                <option value="voicesynthesis">音声合成</option>
                <option value="other">その他</option>
              </select>
            </div>
            
            <div className={styles.selectGroup}>
              <label className={styles.label}>期間</label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value as RankingPeriod)}
                className={styles.select}
              >
                <option value="24h">24時間</option>
                <option value="hour">毎時</option>
              </select>
            </div>
          </div>
        </div>
        
        <TagConditionBuilder
          conditions={conditions}
          onChange={setConditions}
          suggestions={suggestions}
          getSuggestions={getFilteredSuggestions}
        />
        
        <div className={styles.formActions}>
          <input
            type="text"
            placeholder="ランキング名を入力..."
            value={rankingName}
            onChange={(e) => setRankingName(e.target.value)}
            className={styles.nameInput}
          />
          <button
            onClick={handleSaveRanking}
            className={styles.saveButton}
            disabled={!rankingName.trim() || (conditions.and.length === 0 && conditions.or.length === 0 && conditions.not.length === 0)}
          >
            {editingRanking ? '更新' : '保存'}
          </button>
          {editingRanking && (
            <button
              onClick={() => {
                setEditingRanking(null)
                setRankingName('')
                setConditions({ and: [], or: [], not: [] })
              }}
              className={styles.cancelButton}
            >
              キャンセル
            </button>
          )}
        </div>
      </div>
      
      {/* 保存済みランキング一覧 */}
      <div className={styles.savedSection}>
        <h2 className={styles.sectionTitle}>保存済みランキング</h2>
        
        {rankings.length === 0 ? (
          <div className={styles.emptyState}>
            <p>保存されたカスタムランキングはありません</p>
            <p className={styles.emptyHint}>
              上のフォームからタグ条件を設定してランキングを作成してみましょう
            </p>
          </div>
        ) : (
          <div className={styles.rankingGrid}>
            {rankings.map(ranking => (
              <CustomRankingCard
                key={ranking.id}
                ranking={ranking}
                onView={handleViewRanking}
                onEdit={handleEditRanking}
                onDelete={handleDeleteRanking}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}