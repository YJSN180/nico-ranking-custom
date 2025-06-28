'use client'

import { useState } from 'react'
import styles from './mylist-modal.module.css'
import type { Mylist } from '@/lib/storage/types'

interface MylistModalProps {
  mylists: Mylist[]
  selectedMylistIds: string[]
  onAddToMylist: (mylistId: string) => Promise<void>
  onRemoveFromMylist?: (mylistId: string) => Promise<void>
  onClose: () => void
  onCreateMylist?: (name: string, description?: string) => Promise<void>
  isProcessing?: boolean
}

export function MylistModal({
  mylists,
  selectedMylistIds,
  onAddToMylist,
  onRemoveFromMylist,
  onClose,
  onCreateMylist,
  isProcessing = false
}: MylistModalProps) {
  const [showNewForm, setShowNewForm] = useState(false)
  const [newMylistName, setNewMylistName] = useState('')
  const [newMylistDescription, setNewMylistDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateMylist = async () => {
    if (!newMylistName.trim() || !onCreateMylist) return

    setIsCreating(true)
    try {
      await onCreateMylist(newMylistName.trim(), newMylistDescription.trim())
      setNewMylistName('')
      setNewMylistDescription('')
      setShowNewForm(false)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to create mylist:', error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  return (
    <>
      <div className={styles.overlay} onClick={onClose} data-testid="modal-overlay" />
      <div 
        className={styles.modal} 
        role="dialog" 
        aria-labelledby="mylist-modal-title"
        onClick={handleModalClick}
      >
        <div className={styles.header}>
          <h2 id="mylist-modal-title" className={styles.title}>マイリストに追加</h2>
          <button 
            className={styles.closeButton}
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className={styles.content}>
          {mylists.length === 0 ? (
            <div style={{ 
              padding: '32px', 
              textAlign: 'center', 
              color: 'var(--text-secondary)' 
            }}>
              <p>マイリストがありません</p>
              <p style={{ marginTop: '8px', fontSize: '14px' }}>
                下の「新規マイリスト作成」ボタンから作成してください
              </p>
            </div>
          ) : (
            mylists.map((mylist) => {
              const isSelected = selectedMylistIds.includes(mylist.id)
              return (
                <button
                  key={mylist.id}
                  className={`${styles.mylistItem} ${isSelected ? styles.selected : ''}`}
                  onClick={async () => {
                    if (isSelected && onRemoveFromMylist) {
                      await onRemoveFromMylist(mylist.id)
                    } else {
                      await onAddToMylist(mylist.id)
                    }
                  }}
                  disabled={isProcessing}
                  aria-label={mylist.name}
                >
                  <div className={styles.mylistIcon}>
                    {isSelected ? '✓' : '📁'}
                  </div>
                  <div className={styles.mylistInfo}>
                    <div className={styles.mylistName}>
                      <span>{mylist.name}</span>
                      {mylist.isDefault && <span className={styles.defaultBadge}>デフォルト</span>}
                    </div>
                    <div className={styles.mylistMeta}>
                      {mylist.videoCount}件の動画
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className={styles.footer}>
          {!showNewForm ? (
            <>
              <button
                className={styles.primaryButton}
                onClick={() => setShowNewForm(true)}
                disabled={!onCreateMylist}
              >
                ＋ 新規マイリスト作成
              </button>
              <button
                className={styles.secondaryButton}
                onClick={onClose}
              >
                閉じる
              </button>
            </>
          ) : (
            <div className={styles.newForm}>
              <input
                type="text"
                className={styles.input}
                placeholder="マイリスト名"
                value={newMylistName}
                onChange={(e) => setNewMylistName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleCreateMylist()
                  }
                }}
                autoFocus
              />
              <textarea
                className={styles.textarea}
                placeholder="説明（任意）"
                value={newMylistDescription}
                onChange={(e) => setNewMylistDescription(e.target.value)}
                rows={2}
              />
              <div className={styles.formButtons}>
                <button
                  className={styles.primaryButton}
                  onClick={handleCreateMylist}
                  disabled={!newMylistName.trim() || isCreating}
                >
                  作成
                </button>
                <button
                  className={styles.secondaryButton}
                  onClick={() => {
                    setShowNewForm(false)
                    setNewMylistName('')
                    setNewMylistDescription('')
                  }}
                  disabled={isCreating}
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}