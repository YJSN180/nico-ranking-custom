'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { OptimizedImage } from '@/components/optimized-image'
import { BackLink } from '@/components/back-link'
import { useWatchHistory } from '@/hooks/use-watch-history'
import { useDeletedVideoDetection } from '@/hooks/use-deleted-video-detection'
import { DBManager } from '@/lib/storage/db-manager'
import { MylistManager } from '@/lib/storage/mylists'
import type { WatchHistoryEntry, Mylist } from '@/lib/storage/types'
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
  
  const { deletedVideoIds, isChecking, checkVideos } = useDeletedVideoDetection()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('watchedAt-desc')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [showMylistModal, setShowMylistModal] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState<WatchHistoryEntry | null>(null)
  const [mylists, setMylists] = useState<Mylist[]>([])
  const [sortedHistory, setSortedHistory] = useState<WatchHistoryEntry[]>([])
  
  const dbManagerRef = useRef<DBManager | null>(null)
  const mylistManagerRef = useRef<MylistManager | null>(null)
  
  // マイリストマネージャーの初期化
  useEffect(() => {
    const init = async () => {
      if (!dbManagerRef.current) {
        dbManagerRef.current = new DBManager()
        await dbManagerRef.current.init()
        mylistManagerRef.current = new MylistManager(dbManagerRef.current)
      }
      
      // マイリスト一覧を取得
      if (mylistManagerRef.current) {
        const allMylists = await mylistManagerRef.current.getAllMylists()
        setMylists(allMylists)
      }
    }
    init()
  }, [])
  
  // 統計情報の読み込み
  useEffect(() => {
    loadStats()
  }, [loadStats])
  
  // 削除済み動画の検出
  useEffect(() => {
    if (history.length > 0) {
      const videos = history.map(item => ({
        id: item.videoId,
        title: item.title,
        thumbURL: item.thumbURL
      }))
      checkVideos(videos)
    }
  }, [history, checkVideos])
  
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
  
  const handleAddToMylist = async (mylistId: string) => {
    if (!mylistManagerRef.current || !selectedVideo) return
    
    try {
      await mylistManagerRef.current.addVideoToMylist(mylistId, {
        id: selectedVideo.videoId,
        mylistId: mylistId,
        title: selectedVideo.title,
        thumbURL: selectedVideo.thumbURL,
        addedAt: Date.now(),
        views: selectedVideo.views,
        comments: selectedVideo.comments,
        mylists: selectedVideo.mylists,
        likes: selectedVideo.likes,
        authorName: selectedVideo.authorName,
        authorId: selectedVideo.authorId,
        registeredAt: selectedVideo.registeredAt
      })
      
      setShowMylistModal(false)
      setSelectedVideo(null)
      
      // 成功メッセージ（実装は省略）
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add to mylist:', error)
    }
  }
  
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
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
        <BackLink href="/" text="ホームに戻る" />
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
      
      {/* 削除済み動画検出中の表示 */}
      {isChecking && (
        <div className={styles.checkingMessage}>
          視聴できない動画を確認しています...
        </div>
      )}
      
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
        <ul className={styles.historyList}>
          {sortedHistory.map((item) => {
            const isDeleted = deletedVideoIds.has(item.videoId)
            
            return (
              <li key={item.videoId} className={styles.historyItem}>
                {isSelectionMode && (
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.videoId)}
                    onChange={() => toggleSelection(item.videoId)}
                    className={styles.checkbox}
                  />
                )}
                
                <div className={styles.itemContent}>
                  {/* サムネイル */}
                  <div className={styles.thumbnail}>
                    {isDeleted ? (
                      <div className={styles.deletedThumbnail}>
                        <OptimizedImage
                          src="/cantwatch.jpg"
                          alt={item.title}
                          width={160}
                          height={90}
                          style={{ opacity: 0.7 }}
                        />
                      </div>
                    ) : (
                      <a
                        href={`https://www.nicovideo.jp/watch/${item.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <OptimizedImage
                          src={item.thumbURL}
                          alt={item.title}
                          width={160}
                          height={90}
                        />
                      </a>
                    )}
                  </div>
                  
                  {/* 詳細 */}
                  <div className={styles.details}>
                    {isDeleted ? (
                      <span className={styles.deletedTitle}>
                        {item.title}
                        <span className={styles.deletedBadge}>（視聴できません）</span>
                      </span>
                    ) : (
                      <a
                        href={`https://www.nicovideo.jp/watch/${item.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.videoTitle}
                      >
                        {item.title}
                      </a>
                    )}
                    
                    {isDeleted && (
                      <p className={styles.deletedMessage}>
                        この動画は削除されたか、非公開になっています
                      </p>
                    )}
                    
                    {!isDeleted && item.authorName && (
                      <div className={styles.author}>
                        <a
                          href={`https://www.nicovideo.jp/user/${item.authorId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {item.authorName}
                        </a>
                      </div>
                    )}
                    
                    <div className={styles.meta}>
                      <span className={styles.watchCount}>視聴回数: {item.watchCount}回</span>
                      <span className={styles.separator}>•</span>
                      <span className={styles.watchedAt}>最終視聴: {formatDate(item.watchedAt)}</span>
                    </div>
                    
                    {item.views !== undefined && (
                      <div className={styles.stats}>
                        <span>再生: {item.views.toLocaleString()}</span>
                        <span>コメント: {item.comments?.toLocaleString() || 0}</span>
                        <span>マイリスト: {item.mylists?.toLocaleString() || 0}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* アクション */}
                  <div className={styles.itemActions}>
                    <button
                      className={styles.btnPrimary}
                      onClick={() => {
                        setSelectedVideo(item)
                        setShowMylistModal(true)
                      }}
                    >
                      マイリストに追加
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      
      {/* マイリスト選択モーダル */}
      {showMylistModal && selectedVideo && (
        <div className={styles.modalOverlay} onClick={() => setShowMylistModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>マイリストに追加</h2>
              <button
                className={styles.closeButton}
                onClick={() => setShowMylistModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className={styles.modalContent}>
              <div className={styles.videoPreview}>
                <OptimizedImage
                  src={selectedVideo.thumbURL}
                  alt={selectedVideo.title}
                  width={120}
                  height={67}
                />
                <p className={styles.previewTitle}>{selectedVideo.title}</p>
              </div>
              
              <ul className={styles.mylistList}>
                {mylists.map((mylist) => (
                  <li key={mylist.id}>
                    <button
                      className={styles.mylistItem}
                      onClick={() => handleAddToMylist(mylist.id)}
                    >
                      <span className={styles.mylistName}>{mylist.name}</span>
                      <span className={styles.videoCount}>{mylist.videoCount}件</span>
                    </button>
                  </li>
                ))}
              </ul>
              
              <div className={styles.modalFooter}>
                <Link href="/mylists" className={styles.createNewLink}>
                  新しいマイリストを作成
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}