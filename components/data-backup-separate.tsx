'use client'

import { useState } from 'react'
import { useUserNGList } from '@/hooks/use-user-ng-list'
import { useGenreOrder } from '@/hooks/use-genre-order'
import type { RankingGenre } from '@/types/ranking-config'
import { exportNGListData, downloadNGListBackup, importNGListData, readNGListBackupFile } from '@/lib/storage/ng-backup'
import styles from './settings-modal.module.css'

type ExportType = 'nglist' | 'genre-order'

export function DataBackupSeparate() {
  const [exportType, setExportType] = useState<ExportType>('nglist')
  const [importType, setImportType] = useState<ExportType>('nglist')
  const [importStatus, setImportStatus] = useState<string | null>(null)
  
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

  // インポート処理
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (importType === 'nglist') {
      // NGリストのインポート（既存の形式を使用）
      try {
        const data = await readNGListBackupFile(file)
        const result = await importNGListData(data)
        
        if (result.success) {
          setImportStatus(`✅ NGリストを正常にインポートしました（${result.imported.totalItems}件）`)
        } else {
          setImportStatus(`❌ インポートに失敗しました: ${result.errors.join(', ')}`)
        }
      } catch (error) {
        setImportStatus(`❌ ファイルの読み込みに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
      }
    } else {
      // ジャンル並び替えのインポート
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string)
          
          // ジャンル並び替えファイルの確認
          if (!data.type || data.type !== 'genre-order') {
            setImportStatus('❌ ジャンル並び替えのファイルを選択してください')
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
            
            setImportStatus('✅ ジャンル並び替えを正常にインポートしました')
          } else {
            setImportStatus('❌ ファイル形式が正しくありません')
          }
        } catch (error) {
          setImportStatus('❌ ファイルの読み込みに失敗しました')
        }
      }
      reader.readAsText(file)
    }
    
    // インプットをリセット
    event.target.value = ''
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* エクスポート */}
      <div>
        <h4 style={{ marginBottom: '16px', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
          📤 エクスポート
        </h4>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', cursor: 'pointer' }}>
            <input
              type="radio"
              value="nglist"
              checked={exportType === 'nglist'}
              onChange={(e) => setExportType(e.target.value as ExportType)}
              style={{ marginRight: '8px' }}
            />
            <span>NGリスト</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="radio"
              value="genre-order"
              checked={exportType === 'genre-order'}
              onChange={(e) => setExportType(e.target.value as ExportType)}
              style={{ marginRight: '8px' }}
            />
            <span>ジャンル並び替え</span>
          </label>
        </div>
        
        <button
          onClick={exportType === 'nglist' ? exportNGList : exportGenreOrder}
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
          <span>💾</span>
          {exportType === 'nglist' ? 'NGリストをエクスポート' : 'ジャンル並び替えをエクスポート'}
        </button>
        
        <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          現在の{exportType === 'nglist' ? 'NGリスト' : 'ジャンル並び替え'}設定をJSONファイルとして保存します
        </p>
      </div>

      {/* インポート */}
      <div>
        <h4 style={{ marginBottom: '16px', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
          📥 インポート
        </h4>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', cursor: 'pointer' }}>
            <input
              type="radio"
              value="nglist"
              checked={importType === 'nglist'}
              onChange={(e) => setImportType(e.target.value as ExportType)}
              style={{ marginRight: '8px' }}
            />
            <span>NGリスト</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="radio"
              value="genre-order"
              checked={importType === 'genre-order'}
              onChange={(e) => setImportType(e.target.value as ExportType)}
              style={{ marginRight: '8px' }}
            />
            <span>ジャンル並び替え</span>
          </label>
        </div>
        
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
            onChange={handleImport}
            style={{ display: 'none' }}
          />
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📁</span>
            {importType === 'nglist' ? 'NGリストファイルを選択' : 'ジャンル並び替えファイルを選択'}
          </span>
        </label>
        
        <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          以前エクスポートした{importType === 'nglist' ? 'NGリスト' : 'ジャンル並び替え'}ファイルを読み込みます
        </p>
        
        {importStatus && (
          <div style={{
            marginTop: '12px',
            padding: '12px',
            background: importStatus.startsWith('✅') ? 'var(--success-bg, #e6f7e6)' : 'var(--error-bg, #ffe6e6)',
            borderRadius: '6px',
            fontSize: '14px',
            color: importStatus.startsWith('✅') ? 'var(--success-color, #52c41a)' : 'var(--error-color, #f5222d)'
          }}>
            {importStatus}
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