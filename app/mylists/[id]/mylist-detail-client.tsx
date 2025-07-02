'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { OptimizedImage } from '@/components/optimized-image'
import { DBManager } from '@/lib/storage/db-manager'
import { MylistManager } from '@/lib/storage/mylists'
import { BackLink } from '@/components/back-link'
import { MylistVideoItem } from '@/components/mylist-video-item'
import type { Mylist, MylistVideo } from '@/lib/storage/types'
import styles from './mylist-detail.module.css'
import '@/components/mylist-video-item.css'

type SortOrder = 'addedAt-desc' | 'addedAt-asc' | 'title-asc' | 'title-desc' | 'views-desc'

export function MylistDetailClient() {
  const params = useParams()
  const router = useRouter()
  const mylistId = params.id as string
  
  const [mylist, setMylist] = useState<Mylist | null>(null)
  const [videos, setVideos] = useState<MylistVideo[]>([])
  const [filteredVideos, setFilteredVideos] = useState<MylistVideo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('addedAt-desc')
  const [editingVideo, setEditingVideo] = useState<MylistVideo | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  
  const dbManagerRef = useRef<DBManager | null>(null)
  const mylistManagerRef = useRef<MylistManager | null>(null)
  

  const loadMylistData = useCallback(async () => {
    if (!mylistManagerRef.current) return
    
    try {
      const mylistData = await mylistManagerRef.current.getMylist(mylistId)
      if (!mylistData) {
        router.push('/mylists')
        return
      }
      setMylist(mylistData)
      
      const videosData = await mylistManagerRef.current.getVideosInMylistWithOrder(mylistId)
      setVideos(videosData)
      setFilteredVideos(videosData)
      
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load mylist data:', error)
    }
  }, [mylistId, router])

  // 初期化とデータ読み込み
  useEffect(() => {
    let mounted = true
    
    const init = async () => {
      // Wait a bit to ensure hydration is complete
      await new Promise(resolve => setTimeout(resolve, 100))
      
      if (!mounted) return
      
      try {
        if (!dbManagerRef.current) {
          dbManagerRef.current = new DBManager()
          await dbManagerRef.current.init()
          mylistManagerRef.current = new MylistManager(dbManagerRef.current)
        }

        await loadMylistData()
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to initialize mylist detail:', error)
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }
    init()
    
    return () => {
      mounted = false
    }
  }, [mylistId, loadMylistData])

  // 検索とソート処理を統合
  useEffect(() => {
    const searchAndSort = async () => {
      if (!mylistManagerRef.current) return
      
      let searchResults
      if (searchQuery) {
        searchResults = await mylistManagerRef.current.searchVideosInMylist(mylistId, searchQuery)
      } else {
        searchResults = videos
      }

      // ソート処理
      const sorted = [...searchResults].sort((a, b) => {
        switch (sortOrder) {
          case 'addedAt-desc':
            return b.addedAt - a.addedAt
          case 'addedAt-asc':
            return a.addedAt - b.addedAt
          case 'title-asc':
            return a.title.localeCompare(b.title, 'ja')
          case 'title-desc':
            return b.title.localeCompare(a.title, 'ja')
          case 'views-desc':
            return (b.views || 0) - (a.views || 0)
          default:
            return 0
        }
      })
      
      setFilteredVideos(sorted)
    }
    
    const debounce = setTimeout(searchAndSort, 300)
    return () => clearTimeout(debounce)
  }, [searchQuery, videos, mylistId, sortOrder])

  const handleRemoveVideo = async (videoId: string) => {
    if (!mylistManagerRef.current) return
    
    if (!confirm('この動画をマイリストから削除しますか？')) {
      return
    }
    
    try {
      await mylistManagerRef.current.removeVideoFromMylist(mylistId, videoId)
      await loadMylistData()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to remove video:', error)
    }
  }

  const handleUpdateMemo = async (videoId: string, memo: string) => {
    if (!mylistManagerRef.current) return
    
    try {
      await mylistManagerRef.current.updateVideoMemo(mylistId, videoId, memo)
      await loadMylistData()
      setEditingVideo(null)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update memo:', error)
    }
  }

  const handleUpdateMylist = async (updates: { name?: string; description?: string }) => {
    if (!mylistManagerRef.current || !mylist) return
    
    try {
      await mylistManagerRef.current.updateMylist(mylistId, updates)
      await loadMylistData()
      setShowSettings(false)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update mylist:', error)
    }
  }

  const handleDeleteMylist = async () => {
    if (!mylistManagerRef.current || !mylist) return
    
    if (!confirm(`マイリスト「${mylist.name}」を削除してもよろしいですか？\n含まれる動画も全て削除されます。`)) {
      return
    }
    
    try {
      await mylistManagerRef.current.deleteMylist(mylistId)
      router.push('/mylists')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete mylist:', error)
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

  if (!mylist) {
    return (
      <div className={styles.container}>
        <div className={styles.notFound}>
          <p>マイリストが見つかりません</p>
          <BackLink href="/mylists" text="マイリスト一覧に戻る" />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* ヘッダー */}
      <div className={styles.headerTop}>
        <BackLink href="/mylists" text="マイリスト一覧に戻る" />
      </div>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.headerInfo}>
            <h2 className={styles.title}>{mylist.name}</h2>
            <p className={styles.videoCount}>{mylist.videoCount} 件の動画</p>
            {mylist.description && (
              <p className={styles.description}>{mylist.description}</p>
            )}
          </div>
          <button
            className={styles.settingsButton}
            onClick={() => setShowSettings(true)}
          >
            マイリスト設定
          </button>
        </div>
      </div>

      {/* 検索・ソート */}
      <div className={styles.controls}>
        <input
          type="text"
          className={styles.searchBar}
          placeholder="マイリスト内を検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className={styles.sortSelect}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
        >
          <option value="addedAt-desc">追加日（新しい順）</option>
          <option value="addedAt-asc">追加日（古い順）</option>
          <option value="title-asc">タイトル（昇順）</option>
          <option value="title-desc">タイトル（降順）</option>
          <option value="views-desc">再生数（多い順）</option>
        </select>
      </div>


      {/* 動画一覧 */}
      {filteredVideos.length === 0 ? (
        <div className={styles.emptyState}>
          {videos.length === 0 ? (
            <>
              <p>まだ動画が登録されていません</p>
              <Link href="/" className={styles.addVideoLink}>
                ランキングページから動画を追加してください
              </Link>
            </>
          ) : (
            <p>検索条件に一致する動画が見つかりません</p>
          )}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {filteredVideos.map((video, index) => (
            <li
              key={video.id}
              style={{ position: 'relative' }}
            >
              <MylistVideoItem
                video={video}
                rank={index + 1}
                onEdit={setEditingVideo}
                onRemove={handleRemoveVideo}
              />
            </li>
          ))}
        </ul>
      )}

      {/* メモ編集モーダル */}
      {editingVideo && (
        <MemoEditModal
          video={editingVideo}
          onClose={() => setEditingVideo(null)}
          onSave={handleUpdateMemo}
        />
      )}

      {/* マイリスト設定モーダル */}
      {showSettings && (
        <MylistSettingsModal
          mylist={mylist}
          onClose={() => setShowSettings(false)}
          onUpdate={handleUpdateMylist}
          onDelete={handleDeleteMylist}
        />
      )}
    </div>
  )
}

// メモ編集モーダル
interface MemoEditModalProps {
  video: MylistVideo
  onClose: () => void
  onSave: (videoId: string, memo: string) => void
}

function MemoEditModal({ video, onClose, onSave }: MemoEditModalProps) {
  const [memo, setMemo] = useState(video.memo || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(video.id, memo)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          動画メモの編集
        </div>
        
        <div className={styles.videoPreview}>
          <OptimizedImage
            src={video.thumbURL}
            alt={video.title}
            width={120}
            height={67}
            style={{ objectFit: 'cover', borderRadius: '4px' }}
          />
          <div>
            <p className={styles.previewTitle}>{video.title}</p>
          </div>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>メモ:</label>
            <textarea
              className={styles.formTextarea}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="この動画についてのメモを入力..."
              rows={5}
              maxLength={500}
              autoFocus
            />
            <div style={{ 
              textAlign: 'right', 
              fontSize: '12px', 
              color: 'var(--text-secondary)',
              marginTop: '4px'
            }}>
              {memo.length}/500文字
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onClose}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// マイリスト設定モーダル
interface MylistSettingsModalProps {
  mylist: Mylist
  onClose: () => void
  onUpdate: (updates: { name?: string; description?: string }) => void
  onDelete: () => void
}

function MylistSettingsModal({ mylist, onClose, onUpdate, onDelete }: MylistSettingsModalProps) {
  const [name, setName] = useState(mylist.name)
  const [description, setDescription] = useState(mylist.description || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onUpdate({
        name: name.trim(),
        description: description.trim() || undefined
      })
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          マイリスト設定
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>マイリスト名:</label>
            <input
              type="text"
              className={styles.formInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>説明（任意）:</label>
            <textarea
              className={styles.formTextarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.btnDanger}
              onClick={onDelete}
            >
              マイリストを削除
            </button>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={onClose}
              >
                キャンセル
              </button>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={!name.trim()}
              >
                更新
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}