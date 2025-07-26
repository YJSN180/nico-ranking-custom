'use client'

import { useState } from 'react'
import { useCustomRankings } from '@/hooks/use-custom-rankings'
import type { CustomRankingWithConditions } from '@/lib/storage/types'
import styles from './genre-order-backup.module.css'

interface BackupData {
  version: number
  exportDate: string
  customRankings: CustomRankingWithConditions[]
}

export function CustomRankingBackup() {
  const { rankings } = useCustomRankings()
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importConfirmOpen, setImportConfirmOpen] = useState(false)
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [pendingImportData, setPendingImportData] = useState<BackupData | null>(null)
  const [conflictRankings, setConflictRankings] = useState<string[]>([])

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const data: BackupData = {
        version: 1,
        exportDate: new Date().toISOString(),
        customRankings: rankings
      }
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `custom-rankings-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export custom rankings:', error)
      alert('カスタムランキングデータのエクスポートに失敗しました')
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setImportMessage(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const data = JSON.parse(content) as BackupData
        
        // バリデーション
        if (!data.version || !data.customRankings || !Array.isArray(data.customRankings)) {
          throw new Error('無効なバックアップファイル形式です')
        }

        // 各ランキングのバリデーション
        for (const ranking of data.customRankings) {
          if (!ranking.id || !ranking.title || !ranking.baseGenre) {
            throw new Error('無効なカスタムランキングデータが含まれています')
          }
          
          // 条件のバリデーション
          if (ranking.conditions && Array.isArray(ranking.conditions)) {
            for (const condition of ranking.conditions) {
              if (!condition.tag || !condition.operator || !condition.tagType) {
                throw new Error('無効なタグ条件が含まれています')
              }
            }
          }
        }

        // 重複タイトルをチェック
        const existingTitles = rankings.map(r => r.title)
        const conflicts = data.customRankings
          .filter(r => existingTitles.includes(r.title))
          .map(r => r.title)

        if (conflicts.length > 0) {
          setConflictRankings(conflicts)
        }

        // 確認ダイアログを表示
        setPendingImportData(data)
        setImportConfirmOpen(true)
      } catch (error) {
        console.error('Failed to import custom rankings:', error)
        setImportMessage({ 
          type: 'error', 
          text: error instanceof Error ? error.message : 'インポートに失敗しました' 
        })
      } finally {
        setIsImporting(false)
      }
    }
    
    reader.readAsText(file)
    
    // ファイル選択をリセット
    event.target.value = ''
  }

  const confirmImport = async () => {
    if (!pendingImportData) return

    setIsImporting(true)
    try {
      // Direct import to IndexedDB
      const { DBManager } = await import('@/lib/storage/db-manager')
      const { CustomRankingManager } = await import('@/lib/storage/custom-rankings')
      
      const dbManager = new DBManager()
      await dbManager.init()
      const rankingManager = new CustomRankingManager(dbManager)
      
      let importedCount = 0
      let updatedCount = 0
      
      for (const ranking of pendingImportData.customRankings) {
        // Check if ranking with same title exists
        const existing = rankings.find(r => r.title === ranking.title)
        
        if (existing) {
          // Update existing ranking
          await rankingManager.updateRanking(existing.id, {
            title: ranking.title,
            baseGenre: ranking.baseGenre,
            conditions: ranking.conditions.map(c => ({
              tag: c.tag,
              operator: c.operator,
              tagType: c.tagType,
              orderIndex: c.orderIndex
            }))
          })
          updatedCount++
        } else {
          // Create new ranking
          await rankingManager.createRanking({
            title: ranking.title,
            baseGenre: ranking.baseGenre,
            conditions: ranking.conditions.map(c => ({
              tag: c.tag,
              operator: c.operator,
              tagType: c.tagType,
              orderIndex: c.orderIndex
            }))
          })
          importedCount++
        }
      }
      
      setImportMessage({ 
        type: 'success', 
        text: `カスタムランキングデータをインポートしました。（${importedCount}件追加${updatedCount > 0 ? `、${updatedCount}件更新` : ''}）` 
      })
      setImportConfirmOpen(false)
      setPendingImportData(null)
      setConflictRankings([])
      
      // リロード確認
      setTimeout(() => {
        if (confirm('インポートが完了しました。ページをリロードして変更を反映しますか？')) {
          window.location.reload()
        }
      }, 1500)
    } catch (error) {
      console.error('Failed to apply import:', error)
      setImportMessage({ 
        type: 'error', 
        text: 'インポート処理に失敗しました' 
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className={styles.genreOrderBackup}>
      <div className={styles.backupActions}>
        {/* エクスポートボタン */}
        <button
          onClick={handleExport}
          disabled={isExporting}
          className={`${styles.backupButton} ${styles.exportButton}`}
          data-testid="export-custom-ranking-button"
        >
          <svg className={styles.buttonIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8h3a2 2 0 002-2v-11a2 2 0 00-2-2h-3m-10 0H4a2 2 0 00-2 2v11a2 2 0 002 2h3" />
          </svg>
          エクスポート
        </button>
        
        {/* インポートボタン */}
        <label className={`${styles.backupButton} ${styles.importButton}`} data-testid="import-custom-ranking-button">
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            disabled={isImporting}
            className={styles.fileInput}
            data-testid="import-file-input"
          />
          <svg className={styles.buttonIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v6m0 0l-3-3m3 3l3-3m2 8h3a2 2 0 012 2v3a2 2 0 01-2-2h-3m-10 0H4a2 2 0 01-2-2v-3a2 2 0 012-2h3" />
          </svg>
          インポート
        </label>
      </div>

      {/* インポート確認ダイアログ */}
      {importConfirmOpen && pendingImportData && (
        <div className={styles.backupDialogOverlay} onClick={() => setImportConfirmOpen(false)}>
          <div 
            className={styles.backupDialog} 
            onClick={(e) => e.stopPropagation()}
            data-testid="import-confirm-dialog"
          >
            <h3>カスタムランキングデータをインポート</h3>
            <p>
              選択されたバックアップファイルからカスタムランキング設定を復元します。
            </p>
            
            <div className={styles.importInfo}>
              <div>バックアップ日時: {new Date(pendingImportData.exportDate).toLocaleString('ja-JP')}</div>
              <div>カスタムランキング数: {pendingImportData.customRankings.length}件</div>
            </div>

            {conflictRankings.length > 0 && (
              <div className={styles.warningInfo}>
                ⚠️ 以下のタイトルは既に存在します。インポートすると設定が更新されます：
                <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                  {conflictRankings.map(title => (
                    <li key={title}>{title}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className={styles.dialogNote}>
              新しいカスタムランキングは追加され、同名のものは更新されます。
              {conflictRankings.length === 0 && '既存のカスタムランキングはそのまま残ります。'}
            </p>

            <div className={styles.dialogActions}>
              <button 
                onClick={() => {
                  setImportConfirmOpen(false)
                  setPendingImportData(null)
                  setConflictRankings([])
                }}
                className={`${styles.dialogButton} ${styles.cancelButton}`}
              >
                キャンセル
              </button>
              <button 
                onClick={confirmImport}
                disabled={isImporting}
                className={`${styles.dialogButton} ${styles.confirmButton}`}
              >
                {isImporting ? 'インポート中...' : 'インポート実行'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* インポート結果メッセージ */}
      {importMessage && (
        <div 
          className={`${styles.importResult} ${importMessage.type === 'success' ? styles.success : styles.error}`}
          data-testid={importMessage.type === 'success' ? 'import-success-message' : 'import-error-message'}
        >
          {importMessage.text}
        </div>
      )}
    </div>
  )
}