'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { DBManager } from '@/lib/storage/db-manager'
import { MylistManager } from '@/lib/storage/mylists'
import type { Mylist } from '@/lib/storage/types'
import styles from './mylists.module.css'

export function MylistsClient() {
  const [mylists, setMylists] = useState<Mylist[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingMylist, setEditingMylist] = useState<Mylist | null>(null)
  const [storageInfo, setStorageInfo] = useState({ used: 0, quota: 0 })
  const router = useRouter()
  const dbManagerRef = useRef<DBManager | null>(null)
  const mylistManagerRef = useRef<MylistManager | null>(null)

  useEffect(() => {
    let mounted = true
    
    const init = async () => {
      // Debug logs removed for production
      
      // Wait a bit to ensure hydration is complete
      await new Promise(resolve => setTimeout(resolve, 100))
      
      if (!mounted) return
      
      try {
        if (!dbManagerRef.current) {
          dbManagerRef.current = new DBManager()
          await dbManagerRef.current.init()
          mylistManagerRef.current = new MylistManager(dbManagerRef.current)
        }

        // デフォルトマイリストを確保
        await mylistManagerRef.current.getOrCreateDefaultMylist()
        
        // マイリスト一覧を取得
        await loadMylists()
        
        // ストレージ情報を取得
        await updateStorageInfo()
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to initialize mylists page:', error)
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
  }, [])

  const loadMylists = async () => {
    if (!mylistManagerRef.current) return
    
    try {
      const allMylists = await mylistManagerRef.current.getAllMylists()
      setMylists(allMylists)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load mylists:', error)
    }
  }

  const updateStorageInfo = async () => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate()
        setStorageInfo({
          used: estimate.usage || 0,
          quota: estimate.quota || 0
        })
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to get storage info:', error)
      }
    }
  }

  const handleCreateMylist = async (name: string, description?: string) => {
    if (!mylistManagerRef.current) return

    try {
      await mylistManagerRef.current.createMylist(name, description)
      await loadMylists()
      setShowCreateModal(false)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to create mylist:', error)
    }
  }

  const handleUpdateMylist = async (mylistId: string, updates: { name?: string; description?: string }) => {
    if (!mylistManagerRef.current) return

    try {
      await mylistManagerRef.current.updateMylist(mylistId, updates)
      await loadMylists()
      setEditingMylist(null)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update mylist:', error)
    }
  }

  const handleDeleteMylist = async (mylistId: string) => {
    if (!mylistManagerRef.current) return
    
    if (!confirm('このマイリストを削除してもよろしいですか？\n含まれる動画も全て削除されます。')) {
      return
    }

    try {
      await mylistManagerRef.current.deleteMylist(mylistId)
      await loadMylists()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete mylist:', error)
      if (error instanceof Error && error.message.includes('default')) {
        alert('デフォルトマイリストは削除できません')
      }
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
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
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h2 className={styles.title}>マイリスト管理</h2>
          <button
            className={styles.createButton}
            onClick={() => setShowCreateModal(true)}
          >
            ＋ 新規マイリスト作成
          </button>
        </div>
      </div>

      <div className={styles.mylistGrid}>
        {mylists.map(mylist => (
          <div
            key={mylist.id}
            className={`${styles.mylistCard} ${mylist.isDefault ? styles.defaultMylist : ''}`}
            onClick={() => router.push(`/mylists/${mylist.id}`)}
          >
            <div className={styles.mylistInfo}>
              <div className={styles.mylistIcon}>📁</div>
              <div className={styles.mylistDetails}>
                <h3>{mylist.name}</h3>
                {mylist.description && (
                  <p className={styles.description}>{mylist.description}</p>
                )}
                <div className={styles.mylistMeta}>
                  <span>{mylist.videoCount} 件の動画</span>
                  <span> · </span>
                  <span>最終更新: {formatDate(mylist.updatedAt)}</span>
                </div>
              </div>
            </div>
            <div className={styles.mylistActions}>
              {!mylist.isDefault && (
                <>
                  <button
                    className={styles.editButton}
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingMylist(mylist)
                    }}
                  >
                    編集
                  </button>
                  <button
                    className={styles.deleteButton}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteMylist(mylist.id)
                    }}
                  >
                    削除
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* データ管理セクション */}
      <div className={styles.dataManagement}>
        <div className={styles.storageInfo}>
          <h3>ストレージ使用量</h3>
          <div className={styles.storageBar}>
            <div 
              className={styles.storageUsed}
              style={{ width: `${(storageInfo.used / storageInfo.quota) * 100}%` }}
            />
          </div>
          <p>
            {formatBytes(storageInfo.used)} / {formatBytes(storageInfo.quota)} 使用中
          </p>
        </div>
        <div className={styles.dataActions}>
          <button className={styles.exportButton} disabled>
            📥 エクスポート (準備中)
          </button>
          <button className={styles.importButton} disabled>
            📤 インポート (準備中)
          </button>
        </div>
      </div>

      {/* マイリスト作成モーダル */}
      {showCreateModal && (
        <CreateMylistModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateMylist}
        />
      )}

      {/* マイリスト編集モーダル */}
      {editingMylist && (
        <EditMylistModal
          mylist={editingMylist}
          onClose={() => setEditingMylist(null)}
          onUpdate={handleUpdateMylist}
        />
      )}
    </div>
  )
}

// マイリスト作成モーダル
interface CreateMylistModalProps {
  onClose: () => void
  onCreate: (name: string, description?: string) => void
}

function CreateMylistModal({ onClose, onCreate }: CreateMylistModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onCreate(name.trim(), description.trim() || undefined)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          新規マイリスト作成
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>マイリスト名:</label>
            <input
              type="text"
              className={styles.formInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: お気に入りの音楽"
              autoFocus
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>説明（任意）:</label>
            <textarea
              className={styles.formTextarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="このマイリストの説明を入力..."
              rows={3}
            />
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
              disabled={!name.trim()}
            >
              作成
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// マイリスト編集モーダル
interface EditMylistModalProps {
  mylist: Mylist
  onClose: () => void
  onUpdate: (mylistId: string, updates: { name?: string; description?: string }) => void
}

function EditMylistModal({ mylist, onClose, onUpdate }: EditMylistModalProps) {
  const [name, setName] = useState(mylist.name)
  const [description, setDescription] = useState(mylist.description || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onUpdate(mylist.id, {
        name: name.trim(),
        description: description.trim() || undefined
      })
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          マイリスト編集
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>マイリスト名:</label>
            <input
              type="text"
              className={styles.formInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: お気に入りの音楽"
              autoFocus
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>説明（任意）:</label>
            <textarea
              className={styles.formTextarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="このマイリストの説明を入力..."
              rows={3}
            />
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
              disabled={!name.trim()}
            >
              更新
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}