'use client'

import { useState } from 'react'
import type { Mylist } from '@/lib/storage/types'
import styles from '../mylists.module.css'

// マイリスト作成モーダル
interface CreateMylistModalProps {
  onClose: () => void
  onCreate: (name: string, description?: string) => void
}

export function CreateMylistModal({ onClose, onCreate }: CreateMylistModalProps) {
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

export function EditMylistModal({ mylist, onClose, onUpdate }: EditMylistModalProps) {
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