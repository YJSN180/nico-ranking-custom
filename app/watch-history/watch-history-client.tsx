'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { WatchHistoryVideoItem } from '@/components/watch-history-video-item'
import { useWatchHistory } from '@/hooks/use-watch-history'
import type { WatchHistoryEntry } from '@/lib/storage/types'
import styles from './watch-history.module.css'

type SortOrder = 'watchedAt-desc' | 'watchedAt-asc' | 'watchCount-desc' | 'title-asc' | 'title-desc'

export function WatchHistoryPage() {
  const {
    history,
    isLoading,
    selectedItems,
    stats,
    searchHistory,
    removeSelected,
    clearAllHistory,
    toggleSelection,
    toggleSelectAll,
    loadStats
  } = useWatchHistory()
  
  
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('watchedAt-desc')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [sortedHistory, setSortedHistory] = useState<WatchHistoryEntry[]>([])
  
  
  // 統計情報の読み込み
  useEffect(() => {
    loadStats()
  }, [loadStats])
  
  
  // 検索処理
  useEffect(() => {
    const debounce = setTimeout(() => {
      if (searchQuery) {
        searchHistory(searchQuery)
      } else {
        // 検索クエリが空の場合は全件表示
        searchHistory('')
      }
    }, 300)
    
    return () => clearTimeout(debounce)
  }, [searchQuery, searchHistory])
  
  // ソート処理
  useEffect(() => {
    const sorted = [...history].sort((a, b) => {
      switch (sortOrder) {
        case 'watchedAt-desc':
          return b.watchedAt - a.watchedAt
        case 'watchedAt-asc':
          return a.watchedAt - b.watchedAt
        case 'watchCount-desc':
          return b.watchCount - a.watchCount
        case 'title-asc':
          return a.title.localeCompare(b.title, 'ja')
        case 'title-desc':
          return b.title.localeCompare(a.title, 'ja')
        default:
          return 0
      }
    })
    setSortedHistory(sorted)
  }, [history, sortOrder])
  
  
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>読み込み中...</div>
      </div>
    )
  }
  
  return (
    <div className={styles.container}>
        {/* ヘッダー */}
        <div className={styles.header}>
          <h1 className={styles.title}>視聴履歴</h1>
          {stats && (
            <p className={styles.stats}>全{stats.totalCount}件の視聴履歴</p>
          )}
        </div>
      
      {/* コントロール */}
      <div className={styles.controls}>
        <div className={styles.searchAndSort}>
          <input
            type="text"
            className={styles.searchBar}
            placeholder="視聴履歴を検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className={styles.sortSelect}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          >
            <option value="watchedAt-desc">視聴日時（新しい順）</option>
            <option value="watchedAt-asc">視聴日時（古い順）</option>
            <option value="watchCount-desc">視聴回数（多い順）</option>
            <option value="title-asc">タイトル（昇順）</option>
            <option value="title-desc">タイトル（降順）</option>
          </select>
        </div>
        
        <div className={styles.actions}>
          {isSelectionMode ? (
            <>
              <button
                className={styles.btnSecondary}
                onClick={() => {
                  setIsSelectionMode(false)
                  // 選択をクリア
                  selectedItems.clear()
                }}
              >
                キャンセル
              </button>
              <button
                className={styles.btnSecondary}
                onClick={toggleSelectAll}
              >
                {selectedItems.size === sortedHistory.length ? 'すべて解除' : 'すべて選択'}
              </button>
              <button
                className={styles.btnDanger}
                onClick={removeSelected}
                disabled={selectedItems.size === 0}
              >
                削除 ({selectedItems.size})
              </button>
            </>
          ) : (
            <>
              <button
                className={styles.btnSecondary}
                onClick={() => setIsSelectionMode(true)}
              >
                選択
              </button>
              <button
                className={styles.btnDanger}
                onClick={clearAllHistory}
                disabled={sortedHistory.length === 0}
              >
                すべて削除
              </button>
            </>
          )}
        </div>
      </div>
      
      
      {/* 視聴履歴一覧 */}
      {sortedHistory.length === 0 ? (
        <div className={styles.emptyState}>
          <p>まだ視聴履歴がありません</p>
          <p className={styles.emptyHint}>動画を視聴すると、ここに履歴が表示されます</p>
          <Link href="/" className={styles.homeLink}>
            ランキングを見る
          </Link>
        </div>
      ) : (
        <div className={styles.historyList}>
          {sortedHistory.map((item) => {
            return (
              <div key={item.videoId} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                {isSelectionMode && (
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.videoId)}
                    onChange={() => toggleSelection(item.videoId)}
                    className={styles.checkbox}
                    style={{ marginTop: '12px' }}
                  />
                )}
                <WatchHistoryVideoItem 
                  video={item}
                  onImageError={(videoId) => {
                    // Handle image error if needed
                    console.warn(`Failed to load thumbnail for video: ${videoId}`)
                  }}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}