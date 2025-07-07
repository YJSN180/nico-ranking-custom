'use client'

import { useState } from 'react'
import { useUserNGList } from '@/hooks/use-user-ng-list'
import { useGenreOrder } from '@/hooks/use-genre-order'
import type { RankingGenre } from '@/types/ranking-config'
import { 
  exportNGListData, 
  downloadNGListBackup, 
  importNGListData, 
  readNGListBackupFile,
  detectConflicts,
  type NGListBackupData,
  type ConflictDetectionResult,
  type NGListImportResult
} from '@/lib/storage/ng-backup'
import styles from './settings-modal.module.css'
import ngStyles from './ng-backup.module.css'

export function DataBackupSeparate() {
  const [ngImportStatus, setNgImportStatus] = useState<string | null>(null)
  const [genreImportStatus, setGenreImportStatus] = useState<string | null>(null)
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
  const [conflictData, setConflictData] = useState<{
    backup: NGListBackupData
    conflicts: ConflictDetectionResult
  } | null>(null)
  const [genreImportDialogOpen, setGenreImportDialogOpen] = useState(false)
  const [pendingGenreData, setPendingGenreData] = useState<{
    order: string[]
    hidden: string[]
  } | null>(null)
  
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
      
      // 重複検出
      const conflicts = detectConflicts(ngList, data.ngList)
      
      if (conflicts.hasConflicts) {
        // 重複がある場合は確認ダイアログを表示
        setConflictData({ backup: data, conflicts })
        setConflictDialogOpen(true)
      } else {
        // 重複がない場合は直接インポート（デフォルト：追加）
        const result = await importNGListData(data)
        
        if (result.success) {
          setNgImportStatus(`✅ NGリストを正常にインポートしました（${result.imported.totalItems}件）`)
          
          setTimeout(() => {
            if (confirm('インポートが完了しました。ページをリロードして変更を反映しますか？')) {
              window.location.reload()
            }
          }, 1500)
        } else {
          setNgImportStatus(`❌ インポートに失敗しました: ${result.errors.join(', ')}`)
        }
      }
    } catch (error) {
      setNgImportStatus(`❌ ファイルの読み込みに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
    }
    
    // インプットをリセット
    event.target.value = ''
  }
  
  // 重複処理選択時のインポート実行
  const handleConflictResolution = async (resolution: 'merge' | 'overwrite') => {
    if (!conflictData) return

    try {
      const result = await importNGListData(conflictData.backup, resolution)
      setConflictDialogOpen(false)
      setConflictData(null)
      
      if (result.success) {
        setNgImportStatus(`✅ NGリストを正常にインポートしました（${result.imported.totalItems}件）`)
        
        setTimeout(() => {
          if (confirm('インポートが完了しました。ページをリロードして変更を反映しますか？')) {
            window.location.reload()
          }
        }, 1500)
      } else {
        setNgImportStatus(`❌ インポートに失敗しました: ${result.errors.join(', ')}`)
      }
    } catch (error) {
      setNgImportStatus(`❌ インポート処理に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
    }
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
          // 確認ダイアログ用にデータを保存
          setPendingGenreData(data.genreOrder)
          setGenreImportDialogOpen(true)
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
  
  // ジャンル並び替えの実際のインポート処理
  const executeGenreImport = () => {
    if (!pendingGenreData) return
    
    const { order, hidden } = pendingGenreData
    
    // 順序の更新
    updateOrder(order as RankingGenre[])
    
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
    setGenreImportDialogOpen(false)
    setPendingGenreData(null)
    
    // リロード促す
    setTimeout(() => {
      if (confirm('インポートが完了しました。ページをリロードして変更を反映しますか？')) {
        window.location.reload()
      }
    }, 1500)
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
      
      {/* 重複解決ダイアログ */}
      {conflictDialogOpen && conflictData && (
        <div className={ngStyles.backupDialogOverlay} onClick={() => setConflictDialogOpen(false)}>
          <div 
            className={ngStyles.backupDialog} 
            onClick={(e) => e.stopPropagation()}
            data-testid="ng-conflict-resolution-dialog"
          >
            <h3>⚠️ 重複するNGリスト項目が見つかりました</h3>
            
            <div className={ngStyles.conflictSummary}>
              <p>インポートしようとしているファイルに、すでに登録されている項目が含まれています。</p>
              
              <div className={ngStyles.exportStats}>
                {conflictData.conflicts.conflicts.videoIds.length > 0 && (
                  <div className={ngStyles.statItem}>
                    <span className={ngStyles.statLabel}>動画ID:</span>
                    <span className={ngStyles.statValue}>
                      {conflictData.conflicts.conflicts.videoIds.length}件の重複
                    </span>
                  </div>
                )}
                
                {(conflictData.conflicts.conflicts.videoTitles.exact.length > 0 || 
                  conflictData.conflicts.conflicts.videoTitles.partial.length > 0 ||
                  conflictData.conflicts.inclusions.videoTitles.length > 0) && (
                  <div className={ngStyles.statItem}>
                    <span className={ngStyles.statLabel}>動画タイトル:</span>
                    <span className={ngStyles.statValue}>
                      {conflictData.conflicts.conflicts.videoTitles.exact.length + conflictData.conflicts.conflicts.videoTitles.partial.length}件の重複
                      {conflictData.conflicts.inclusions.videoTitles.length > 0 && 
                        `, ${conflictData.conflicts.inclusions.videoTitles.length}件の包含関係`
                      }
                    </span>
                  </div>
                )}
                
                {conflictData.conflicts.conflicts.authorIds.length > 0 && (
                  <div className={ngStyles.statItem}>
                    <span className={ngStyles.statLabel}>投稿者ID:</span>
                    <span className={ngStyles.statValue}>
                      {conflictData.conflicts.conflicts.authorIds.length}件の重複
                    </span>
                  </div>
                )}
                
                {(conflictData.conflicts.conflicts.authorNames.exact.length > 0 || 
                  conflictData.conflicts.conflicts.authorNames.partial.length > 0 ||
                  conflictData.conflicts.inclusions.authorNames.length > 0) && (
                  <div className={ngStyles.statItem}>
                    <span className={ngStyles.statLabel}>投稿者名:</span>
                    <span className={ngStyles.statValue}>
                      {conflictData.conflicts.conflicts.authorNames.exact.length + conflictData.conflicts.conflicts.authorNames.partial.length}件の重複
                      {conflictData.conflicts.inclusions.authorNames.length > 0 && 
                        `, ${conflictData.conflicts.inclusions.authorNames.length}件の包含関係`
                      }
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className={ngStyles.resolutionOptions}>
              <p className={ngStyles.resolutionTitle}>どのように処理しますか？</p>
              
              <label className={ngStyles.resolutionOption}>
                <input type="radio" name="resolution" value="merge" defaultChecked />
                <div className={ngStyles.optionContent}>
                  <span className={ngStyles.optionTitle}>重複を無視して追加</span>
                  <span className={ngStyles.optionDescription}>
                    既存の項目はそのままに、新しい項目のみを追加します（推奨）
                  </span>
                </div>
              </label>
              
              <label className={ngStyles.resolutionOption}>
                <input type="radio" name="resolution" value="overwrite" />
                <div className={ngStyles.optionContent}>
                  <span className={ngStyles.optionTitle}>すべて上書き</span>
                  <span className={ngStyles.optionDescription}>
                    既存のNGリストを削除して、インポートしたデータで完全に置き換えます
                  </span>
                </div>
              </label>
            </div>

            <div className={ngStyles.dialogActions}>
              <button 
                onClick={() => {
                  setConflictDialogOpen(false)
                  setConflictData(null)
                }}
                className={`${ngStyles.dialogButton} ${ngStyles.cancelButton}`}
              >
                キャンセル
              </button>
              <button 
                onClick={() => {
                  const selected = document.querySelector('input[name="resolution"]:checked') as HTMLInputElement
                  if (selected) {
                    handleConflictResolution(selected.value as 'merge' | 'overwrite')
                  }
                }}
                className={`${ngStyles.dialogButton} ${ngStyles.confirmButton}`}
              >
                インポート実行
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* ジャンル並び替えインポート確認ダイアログ */}
      {genreImportDialogOpen && pendingGenreData && (
        <div className={ngStyles.backupDialogOverlay} onClick={() => setGenreImportDialogOpen(false)}>
          <div 
            className={ngStyles.backupDialog} 
            onClick={(e) => e.stopPropagation()}
            data-testid="genre-import-confirm-dialog"
          >
            <h3>ジャンル並び替え設定をインポート</h3>
            
            <div style={{ marginBottom: '24px' }}>
              <p style={{ marginBottom: '16px' }}>
                ジャンルの表示順序と表示/非表示設定をインポートします。
              </p>
              
              <div className={ngStyles.exportStats}>
                <div className={ngStyles.statItem}>
                  <span className={ngStyles.statLabel}>ジャンル数:</span>
                  <span className={ngStyles.statValue}>
                    {pendingGenreData.order.length}件
                  </span>
                </div>
                <div className={ngStyles.statItem}>
                  <span className={ngStyles.statLabel}>非表示ジャンル:</span>
                  <span className={ngStyles.statValue}>
                    {pendingGenreData.hidden.length}件
                  </span>
                </div>
              </div>
              
              <p style={{ 
                marginTop: '16px', 
                padding: '12px',
                background: 'var(--warning-bg, #fff9e6)',
                borderRadius: '6px',
                fontSize: '14px',
                color: 'var(--warning-color, #d97706)'
              }}>
                ⚠️ 注意: 現在のジャンル並び替え設定は上書きされます
              </p>
            </div>

            <div className={ngStyles.dialogActions}>
              <button 
                onClick={() => {
                  setGenreImportDialogOpen(false)
                  setPendingGenreData(null)
                }}
                className={`${ngStyles.dialogButton} ${ngStyles.cancelButton}`}
              >
                キャンセル
              </button>
              <button 
                onClick={executeGenreImport}
                className={`${ngStyles.dialogButton} ${ngStyles.confirmButton}`}
              >
                インポート実行
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}