'use client'

import { useEffect, useRef } from 'react'
import styles from './delete-confirmation-modal.module.css'

interface DeleteConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  itemName?: string
}

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  itemName
}: DeleteConfirmationModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // ESCキーで閉じる
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{title}</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.content}>
          <div className={styles.iconContainer}>
            <span className={styles.warningIcon}>⚠️</span>
          </div>
          
          <p className={styles.message}>{message}</p>
          
          {itemName && (
            <div className={styles.itemName}>
              「{itemName}」
            </div>
          )}
          
          <p className={styles.warning}>
            この操作は取り消せません。
          </p>
        </div>

        <div className={styles.footer}>
          <button
            className={styles.cancelButton}
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            className={styles.deleteButton}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  )
}