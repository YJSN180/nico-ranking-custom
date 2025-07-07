'use client'

import { useState } from 'react'
import { useGenreOrderV2 } from '@/hooks/use-genre-order-v2'
import type { GenreItem } from '@/types/genre-order'

export function GenreOrderBackup() {
  const { items } = useGenreOrderV2()
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const handleExport = () => {
    try {
      const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        genreOrder: items
      }
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `genre-order-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export genre order:', error)
      alert('ジャンル並び替えデータのエクスポートに失敗しました')
    }
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const data = JSON.parse(content)
        
        // バリデーション
        if (!data.version || !data.genreOrder || !Array.isArray(data.genreOrder)) {
          throw new Error('無効なバックアップファイル形式です')
        }

        // 各アイテムのバリデーション
        for (const item of data.genreOrder) {
          if (!item.id || typeof item.isVisible !== 'boolean' || typeof item.order !== 'number') {
            throw new Error('無効なジャンルデータが含まれています')
          }
        }

        // LocalStorageに保存
        localStorage.setItem('nicoRankingGenreOrder', JSON.stringify(data.genreOrder))
        
        setImportMessage({ 
          type: 'success', 
          text: 'ジャンル並び替えデータをインポートしました。ページをリロードして反映してください。' 
        })
        
        // 3秒後にリロード
        setTimeout(() => {
          window.location.reload()
        }, 3000)
      } catch (error) {
        console.error('Failed to import genre order:', error)
        setImportMessage({ 
          type: 'error', 
          text: error instanceof Error ? error.message : 'インポートに失敗しました' 
        })
      }
    }
    
    reader.readAsText(file)
    
    // ファイル選択をリセット
    event.target.value = ''
  }

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '1rem',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={handleExport}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'var(--primary-color)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          📥 エクスポート
        </button>
        
        <label style={{
          padding: '0.75rem 1.5rem',
          background: 'var(--surface-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: '600',
          fontSize: '0.95rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          📤 インポート
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </label>
      </div>
      
      {importMessage && (
        <div style={{
          padding: '1rem',
          borderRadius: '6px',
          background: importMessage.type === 'success' 
            ? 'var(--success-bg, #e6f4ea)' 
            : 'var(--error-bg, #fef1f1)',
          color: importMessage.type === 'success'
            ? 'var(--success-color, #1e7e34)'
            : 'var(--error-color, #d73502)',
          marginTop: '1rem',
          lineHeight: 1.5
        }}>
          {importMessage.text}
        </div>
      )}
      
      <div style={{
        marginTop: '1rem',
        padding: '1rem',
        background: 'var(--info-bg, #e8f4fd)',
        borderRadius: '6px',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)',
        lineHeight: 1.6
      }}>
        <strong>📌 使い方:</strong>
        <ul style={{ margin: '0.5rem 0 0 1.5rem', padding: 0 }}>
          <li>エクスポート: 現在のジャンル並び替え設定をファイルに保存します</li>
          <li>インポート: 保存したファイルから設定を復元します</li>
          <li>インポート後は自動的にページがリロードされます</li>
        </ul>
      </div>
    </div>
  )
}