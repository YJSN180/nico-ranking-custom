'use client'

import { useState } from 'react'
import { useUserNGList } from '@/hooks/use-user-ng-list'
import { useGenreOrder } from '@/hooks/use-genre-order'
import type { RankingGenre } from '@/types/ranking-config'
import { exportNGListData, downloadNGListBackup, importNGListData, readNGListBackupFile } from '@/lib/storage/ng-backup'
import styles from './settings-modal.module.css'

export function DataBackupSeparate() {
  const [ngImportStatus, setNgImportStatus] = useState<string | null>(null)
  const [genreImportStatus, setGenreImportStatus] = useState<string | null>(null)
  
  const { ngList, saveNGListDirectly } = useUserNGList()
  const { order: genreOrder, hidden: hiddenGenres, updateOrder, toggleGenreVisibility } = useGenreOrder()

  // NGリストのエクスポート
  const exportNGList = () => {
    try {
      const exportData = exportNGListData()
      downloadNGListBackup(exportData)
    } catch (error) {
      console.error('NGリストのエクスポートに失敗しました:', error)
      alert(error instanceof Error ? error.message : 'エクスポートに失敗しました')
    }
  }

  // ジャンル並び替えのエクスポート
  const exportGenreOrder = () => {
    const exportData = {
      version: 1,
      type: 'genre-order',
      genreOrder: {
        order: genreOrder,
        hidden: Array.from(hiddenGenres)
      },
      exportDate: new Date().toISOString()
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nico-ranking-genre-order-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // NGリストのインポート
  const handleNGImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const data = await readNGListBackupFile(file)
      const result = await importNGListData(data)
      
      if (result.success) {
        setNgImportStatus(`✅ NGリストを正常にインポートしました（${result.imported.totalItems}件）`)
      } else {
        setNgImportStatus(`❌ インポートに失敗しました: ${result.errors.join(', ')}`)
      }
    } catch (error) {
      setNgImportStatus(`❌ ファイルの読み込みに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
    }
    
    // インプットをリセット
    event.target.value = ''
  }

  // ジャンル並び替えのインポート
  const handleGenreImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        
        // ジャンル並び替えファイルの確認
        if (!data.type || data.type !== 'genre-order') {
          setGenreImportStatus('❌ ジャンル並び替えのファイルを選択してください')
          return
        }

        if (data.type === 'genre-order' && data.genreOrder) {
          // ジャンル並び替えのインポート
          const { order, hidden } = data.genreOrder
          
          // 順序の更新
          updateOrder(order)
          
          // 表示/非表示の更新
          const currentHidden = new Set(hiddenGenres)
          const importedHidden = new Set(hidden)
          
          // 現在非表示で、インポートでは表示のものを表示に
          currentHidden.forEach(genre => {
            if (!importedHidden.has(genre)) {
              toggleGenreVisibility(genre)
            }
          })
          
          // 現在表示で、インポートでは非表示のものを非表示に
          importedHidden.forEach((genre: unknown) => {
            if (!currentHidden.has(genre as RankingGenre)) {
              toggleGenreVisibility(genre as RankingGenre)
            }
          })
          
          setGenreImportStatus('✅ ジャンル並び替えを正常にインポートしました')
        } else {
          setGenreImportStatus('❌ ファイル形式が正しくありません')
        }
      } catch (error) {
        setGenreImportStatus('❌ ファイルの読み込みに失敗しました')
      }
    }
    reader.readAsText(file)
    
    // インプットをリセット
    event.target.value = ''
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* NGリストバックアップ */}
      <div style={{
        padding: '20px',
        background: 'var(--surface-secondary)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)'
      }}>
        <h4 style={{ marginBottom: '16px', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
          💾 NGリストバックアップ
        </h4>
        <p style={{ marginBottom: '20px', fontSize: '14px', color: 'var(--text-secondary)' }}>
          現在適用されているNGリストをバックアップファイルとしてエクスポートしたり、他のデバイスからインポートできます。
        </p>
        
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <button
            onClick={exportNGList}
            style={{
              padding: '10px 20px',
              background: 'var(--primary-color)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-color-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-color)'}
          >
            <span>📤</span>
            エクスポート
          </button>
          
          <label
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              background: 'var(--surface-secondary)',
              border: '2px dashed var(--border-color)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--surface-hover)'
              e.currentTarget.style.borderColor = 'var(--primary-color)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--surface-secondary)'
              e.currentTarget.style.borderColor = 'var(--border-color)'
            }}
          >
            <input
              type="file"
              accept=".json"
              onChange={handleNGImport}
              style={{ display: 'none' }}
            />
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📥</span>
              インポート
            </span>
          </label>
        </div>
        
        {ngImportStatus && (
          <div style={{
            padding: '12px',
            background: ngImportStatus.startsWith('✅') ? 'var(--success-bg, #e6f7e6)' : 'var(--error-bg, #ffe6e6)',
            borderRadius: '6px',
            fontSize: '14px',
            color: ngImportStatus.startsWith('✅') ? 'var(--success-color, #52c41a)' : 'var(--error-color, #f5222d)'
          }}>
            {ngImportStatus}
          </div>
        )}
      </div>

      {/* ジャンル並び替えデータバックアップ */}
      <div style={{
        padding: '20px',
        background: 'var(--surface-secondary)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)'
      }}>
        <h4 style={{ marginBottom: '16px', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
          📊 ジャンル並び替えデータバックアップ
        </h4>
        <p style={{ marginBottom: '20px', fontSize: '14px', color: 'var(--text-secondary)' }}>
          カスタマイズしたジャンルの表示順序と表示/非表示設定をバックアップできます。
        </p>
        
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <button
            onClick={exportGenreOrder}
            style={{
              padding: '10px 20px',
              background: 'var(--primary-color)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-color-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-color)'}
          >
            <span>📤</span>
            エクスポート
          </button>
          
          <label
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              background: 'var(--surface-secondary)',
              border: '2px dashed var(--border-color)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--surface-hover)'
              e.currentTarget.style.borderColor = 'var(--primary-color)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--surface-secondary)'
              e.currentTarget.style.borderColor = 'var(--border-color)'
            }}
          >
            <input
              type="file"
              accept=".json"
              onChange={handleGenreImport}
              style={{ display: 'none' }}
            />
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📥</span>
              インポート
            </span>
          </label>
        </div>
        
        {genreImportStatus && (
          <div style={{
            padding: '12px',
            background: genreImportStatus.startsWith('✅') ? 'var(--success-bg, #e6f7e6)' : 'var(--error-bg, #ffe6e6)',
            borderRadius: '6px',
            fontSize: '14px',
            color: genreImportStatus.startsWith('✅') ? 'var(--success-color, #52c41a)' : 'var(--error-color, #f5222d)'
          }}>
            {genreImportStatus}
          </div>
        )}
      </div>

      {/* 注意事項 */}
      <div style={{
        padding: '16px',
        background: 'var(--info-bg)',
        borderRadius: '8px',
        fontSize: '14px',
        color: 'var(--text-secondary)',
        lineHeight: 1.6
      }}>
        <p style={{ margin: 0, fontWeight: 'bold', marginBottom: '8px' }}>
          ⚠️ 注意事項
        </p>
        <ul style={{ margin: '0', paddingLeft: '20px' }}>
          <li>インポートすると現在の設定が上書きされます</li>
          <li>NGリストとジャンル並び替えは別々に管理されます</li>
          <li>異なるタイプのファイルはインポートできません</li>
          <li>バックアップファイルは安全な場所に保管してください</li>
        </ul>
      </div>
    </div>
  )
}