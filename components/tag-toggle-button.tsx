'use client'

import { Tags } from 'lucide-react'
import { useTagDisplay } from '@/contexts/tag-display-context'
import styles from './control.module.css'

// ランキングと検索で同じ表示設定・操作部品を使う。
export function TagToggleButton() {
  const { showTags, toggleTags } = useTagDisplay()
  return (
    <button
      type="button"
      data-testid="tag-toggle-button"
      className={`${styles.button} ${styles.compact}`}
      aria-pressed={showTags}
      onClick={toggleTags}
    >
      <Tags size={16} aria-hidden="true" />
      タグ{showTags ? '非表示' : '表示'}
    </button>
  )
}
