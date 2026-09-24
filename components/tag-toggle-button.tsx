'use client'

import { useTagDisplay } from '@/contexts/tag-display-context'

// タグ表示トグルボタン（ランキング・検索結果で共通。フェーズ4-2で共通化）
// TagDisplayProvider の内側で使うこと
export function TagToggleButton() {
  const { showTags, toggleTags } = useTagDisplay()

  return (
    <button
      data-testid="tag-toggle-button"
      onClick={toggleTags}
      style={{
        padding: '6px 12px',
        fontSize: '12px',
        backgroundColor: showTags ? 'var(--primary-color)' : 'var(--surface-secondary)',
        color: showTags ? 'white' : 'var(--text-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        fontWeight: '500',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        height: '31px'
      }}
      onMouseEnter={(e) => {
        if (!showTags) {
          e.currentTarget.style.backgroundColor = 'var(--surface-hover)'
        }
      }}
      onMouseLeave={(e) => {
        if (!showTags) {
          e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'
        }
      }}
    >
      🏷️ タグ{showTags ? '非表示' : '表示'}
    </button>
  )
}
