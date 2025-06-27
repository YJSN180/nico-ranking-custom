'use client'

import { useState } from 'react'
import type { Mylist } from '@/lib/storage/types'
import styles from './mylist-modal.module.css'

interface MylistModalProps {
  mylists: Mylist[]
  selectedMylistIds: string[]
  onAddToMylist: (mylistId: string) => void
  onClose: () => void
  onCreateMylist?: () => void
  isProcessing?: boolean
}

export function MylistModal({
  mylists,
  selectedMylistIds,
  onAddToMylist,
  onClose,
  onCreateMylist,
  isProcessing = false
}: MylistModalProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div 
      className={styles.overlay} 
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mylist-modal-title"
    >
      <div className={styles.modal}>
        {/* ヘッダー */}
        <div className={styles.header}>
          <h2 id="mylist-modal-title" className={styles.title}>
            マイリストに追加
          </h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="閉じる"
            disabled={isProcessing}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* コンテンツ */}
        <div className={styles.content}>
          {mylists.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📁</div>
              <p className={styles.emptyText}>マイリストがありません</p>
              {onCreateMylist && (
                <button
                  className={styles.createButton}
                  onClick={onCreateMylist}
                  disabled={isProcessing}
                >
                  <span>＋</span>
                  新規マイリストを作成
                </button>
              )}
            </div>
          ) : (
            <div className={styles.mylistList}>
              {mylists.map((mylist) => {
                const isSelected = selectedMylistIds.includes(mylist.id)
                return (
                  <button
                    key={mylist.id}
                    className={`${styles.mylistItem} ${isSelected ? styles.selected : ''} ${mylist.isDefault ? styles.default : ''}`}
                    onClick={() => onAddToMylist(mylist.id)}
                    onMouseEnter={() => setHoveredId(mylist.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    disabled={isProcessing || isSelected}
                    aria-pressed={isSelected}
                  >
                    <div className={styles.iconArea}>
                      {isSelected ? '✓' : mylist.isDefault ? '⭐' : '📁'}
                    </div>
                    <div className={styles.textArea}>
                      <div className={styles.mylistName}>
                        {mylist.name}
                        {isSelected && <span className={styles.checkIcon}>✓</span>}
                      </div>
                      {mylist.description && (
                        <div className={styles.mylistDescription}>
                          {mylist.description}
                        </div>
                      )}
                      <div className={styles.mylistMeta}>
                        <span>{mylist.videoCount || 0}件の動画</span>
                        {mylist.isDefault && (
                          <span className={styles.defaultBadge}>デフォルト</span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className={styles.footer}>
          {onCreateMylist && mylists.length > 0 && (
            <button
              className={styles.createButton}
              onClick={onCreateMylist}
              disabled={isProcessing}
            >
              <span>＋</span>
              新規マイリスト作成
            </button>
          )}
          <button
            className={styles.cancelButton}
            onClick={onClose}
            disabled={isProcessing}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}