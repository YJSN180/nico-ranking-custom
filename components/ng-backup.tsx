'use client'

import { useState } from 'react'
import { 
  exportNGListData, 
  downloadNGListBackup, 
  readNGListBackupFile, 
  importNGListData,
  detectConflicts,
  type NGListBackupData,
  type ConflictDetectionResult,
  type NGListImportResult
} from '@/lib/storage/ng-backup'
import { useUserNGList } from '@/hooks/use-user-ng-list'
import styles from './ng-backup.module.css'

export function NGBackup() {
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false)
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
  const [importResult, setImportResult] = useState<NGListImportResult | null>(null)
  const [conflictData, setConflictData] = useState<{
    backup: NGListBackupData
    conflicts: ConflictDetectionResult
  } | null>(null)

  const { ngList } = useUserNGList()

  // エクスポート処理
  const handleExport = async () => {
    setIsExporting(true)
    try {
      const data = exportNGListData()
      downloadNGListBackup(data)
      setExportConfirmOpen(false)
    } catch (error) {
      console.error('Export failed:', error)
      alert(`エクスポートに失敗しました: ${error}`)
    } finally {
      setIsExporting(false)
    }
  }

  // インポート処理（ファイル選択）
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setImportResult(null)

    try {
      const data = await readNGListBackupFile(file)
      
      // 重複検出
      const conflicts = detectConflicts(ngList, data.ngList)
      
      if (conflicts.hasConflicts) {
        // 重複がある場合は確認ダイアログを表示
        setConflictData({ backup: data, conflicts })
        setConflictDialogOpen(true)
      } else {
        // 重複がない場合は直接インポート
        const result = await importNGListData(data, 'merge')
        setImportResult(result)
        
        if (result.success) {
          setTimeout(() => {
            if (confirm('インポートが完了しました。ページをリロードして変更を反映しますか？')) {
              window.location.reload()
            }
          }, 1500)
        }
      }
    } catch (error) {
      setImportResult({
        success: false,
        imported: {
          totalItems: 0,
          categoryBreakdown: {
            videoIds: 0,
            videoTitlesExact: 0,
            videoTitlesPartial: 0,
            authorIds: 0,
            authorNamesExact: 0,
            authorNamesPartial: 0
          }
        },
        skipped: {
          totalItems: 0,
          reason: []
        },
        errors: [error instanceof Error ? error.message : 'インポートに失敗しました'],
        overwritten: false
      })
    } finally {
      setIsImporting(false)
      // ファイル入力をリセット
      event.target.value = ''
    }
  }

  // 重複処理選択時のインポート実行
  const handleConflictResolution = async (resolution: 'overwrite' | 'merge') => {
    if (!conflictData) return

    setIsImporting(true)
    try {
      const result = await importNGListData(conflictData.backup, resolution)
      setImportResult(result)
      setConflictDialogOpen(false)
      setConflictData(null)
      
      if (result.success) {
        setTimeout(() => {
          if (confirm('インポートが完了しました。ページをリロードして変更を反映しますか？')) {
            window.location.reload()
          }
        }, 1500)
      }
    } catch (error) {
      setImportResult({
        success: false,
        imported: {
          totalItems: 0,
          categoryBreakdown: {
            videoIds: 0,
            videoTitlesExact: 0,
            videoTitlesPartial: 0,
            authorIds: 0,
            authorNamesExact: 0,
            authorNamesPartial: 0
          }
        },
        skipped: {
          totalItems: 0,
          reason: []
        },
        errors: [error instanceof Error ? error.message : 'インポート処理に失敗しました'],
        overwritten: false
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className={styles.ngBackup}>
      <div className={styles.backupActions}>
        {/* エクスポートボタン */}
        <button
          onClick={() => setExportConfirmOpen(true)}
          disabled={isExporting}
          className={`${styles.backupButton} ${styles.exportButton}`}
          data-testid="export-ng-list-button"
        >
          <svg className={styles.buttonIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8h3a2 2 0 002-2v-11a2 2 0 00-2-2h-3m-10 0H4a2 2 0 00-2 2v11a2 2 0 002 2h3" />
          </svg>
          エクスポート
        </button>

        {/* インポートボタン */}
        <label className={`${styles.backupButton} ${styles.importButton}`} data-testid="import-ng-list-button">
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

      {/* エクスポート確認ダイアログ */}
      {exportConfirmOpen && (
        <div className={styles.backupDialogOverlay} onClick={() => setExportConfirmOpen(false)}>
          <div 
            className={styles.backupDialog} 
            onClick={(e) => e.stopPropagation()}
            data-testid="export-confirm-dialog"
          >
            <h3>NGリストをエクスポート</h3>
            <p>現在適用されているNGリストをJSON形式でダウンロードします。</p>
            <div className={styles.exportStats}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>動画ID:</span>
                <span className={styles.statValue}>{ngList.videoIds.length}件</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>動画タイトル:</span>
                <span className={styles.statValue}>
                  {ngList.videoTitles.exact.length + ngList.videoTitles.partial.length}件
                  <small>（完全:{ngList.videoTitles.exact.length} / 部分:{ngList.videoTitles.partial.length}）</small>
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>投稿者:</span>
                <span className={styles.statValue}>
                  {ngList.authorIds.length + ngList.authorNames.exact.length + ngList.authorNames.partial.length}件
                  <small>（ID:{ngList.authorIds.length} / 名前:{ngList.authorNames.exact.length + ngList.authorNames.partial.length}）</small>
                </span>
              </div>
            </div>
            <p className={styles.dialogNote}>このファイルは他のデバイスへの移行やバックアップに使用できます。</p>
            <div className={styles.dialogActions}>
              <button 
                onClick={() => setExportConfirmOpen(false)}
                className={`${styles.dialogButton} ${styles.cancelButton}`}
              >
                キャンセル
              </button>
              <button 
                onClick={handleExport}
                disabled={isExporting}
                className={`${styles.dialogButton} ${styles.confirmButton}`}
              >
                {isExporting ? 'エクスポート中...' : 'ダウンロード'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重複解決ダイアログ */}
      {conflictDialogOpen && conflictData && (
        <div className={styles.backupDialogOverlay} onClick={() => setConflictDialogOpen(false)}>
          <div 
            className={`${styles.backupDialog} ${styles.conflictDialog}`} 
            onClick={(e) => e.stopPropagation()}
            data-testid="conflict-resolution-dialog"
          >
            <h3>⚠️ 重複するアイテムが見つかりました</h3>
            
            <div className={styles.conflictSummary}>
              {conflictData.conflicts.conflicts.videoIds.length > 0 && (
                <div className={styles.conflictItem}>
                  <span className={styles.conflictType}>動画ID:</span>
                  <span className={styles.conflictCount}>{conflictData.conflicts.conflicts.videoIds.length}件の重複</span>
                </div>
              )}
              
              {(conflictData.conflicts.conflicts.videoTitles.exact.length > 0 || 
                conflictData.conflicts.conflicts.videoTitles.partial.length > 0 ||
                conflictData.conflicts.inclusions.videoTitles.length > 0) && (
                <div className={styles.conflictItem}>
                  <span className={styles.conflictType}>動画タイトル:</span>
                  <span className={styles.conflictCount}>
                    {conflictData.conflicts.conflicts.videoTitles.exact.length + conflictData.conflicts.conflicts.videoTitles.partial.length}件の重複
                    {conflictData.conflicts.inclusions.videoTitles.length > 0 && 
                      `, ${conflictData.conflicts.inclusions.videoTitles.length}件の包含関係`
                    }
                  </span>
                </div>
              )}
              
              {conflictData.conflicts.conflicts.authorIds.length > 0 && (
                <div className={styles.conflictItem}>
                  <span className={styles.conflictType}>投稿者ID:</span>
                  <span className={styles.conflictCount}>{conflictData.conflicts.conflicts.authorIds.length}件の重複</span>
                </div>
              )}
              
              {(conflictData.conflicts.conflicts.authorNames.exact.length > 0 || 
                conflictData.conflicts.conflicts.authorNames.partial.length > 0 ||
                conflictData.conflicts.inclusions.authorNames.length > 0) && (
                <div className={styles.conflictItem}>
                  <span className={styles.conflictType}>投稿者名:</span>
                  <span className={styles.conflictCount}>
                    {conflictData.conflicts.conflicts.authorNames.exact.length + conflictData.conflicts.conflicts.authorNames.partial.length}件の重複
                    {conflictData.conflicts.inclusions.authorNames.length > 0 && 
                      `, ${conflictData.conflicts.inclusions.authorNames.length}件の包含関係`
                    }
                  </span>
                </div>
              )}
            </div>

            <div className={styles.resolutionOptions}>
              <p className={styles.resolutionTitle}>どのように処理しますか？</p>
              
              <label className={styles.resolutionOption}>
                <input type="radio" name="resolution" value="overwrite" />
                <div className={styles.optionContent}>
                  <span className={styles.optionTitle}>完全に上書き</span>
                  <span className={styles.optionDescription}>現在のNGリストをインポートデータで完全に置き換えます</span>
                </div>
              </label>
              
              <label className={styles.resolutionOption}>
                <input type="radio" name="resolution" value="merge" defaultChecked />
                <div className={styles.optionContent}>
                  <span className={styles.optionTitle}>マージして結合（推奨）</span>
                  <span className={styles.optionDescription}>重複を除いて両方のデータを結合します</span>
                </div>
              </label>
            </div>

            <div className={styles.dialogActions}>
              <button 
                onClick={() => {
                  setConflictDialogOpen(false)
                  setConflictData(null)
                }}
                className={`${styles.dialogButton} ${styles.cancelButton}`}
              >
                キャンセル
              </button>
              <button 
                onClick={() => {
                  const selected = document.querySelector('input[name="resolution"]:checked') as HTMLInputElement
                  if (selected) {
                    handleConflictResolution(selected.value as 'overwrite' | 'merge')
                  }
                }}
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
      {importResult && (
        <div 
          className={`${styles.importResult} ${importResult.success ? styles.success : styles.error}`}
          data-testid={importResult.success ? 'import-success-message' : 'import-error-message'}
        >
          {importResult.success ? (
            <div>
              <strong>✅ インポート完了</strong>
              <div className={styles.resultDetails}>
                <div>追加されたアイテム: {importResult.imported.totalItems}件</div>
                <div className={styles.categoryDetails}>
                  <span>動画ID: {importResult.imported.categoryBreakdown.videoIds}件</span>
                  <span>動画タイトル: {importResult.imported.categoryBreakdown.videoTitlesExact + importResult.imported.categoryBreakdown.videoTitlesPartial}件</span>
                  <span>投稿者: {importResult.imported.categoryBreakdown.authorIds + importResult.imported.categoryBreakdown.authorNamesExact + importResult.imported.categoryBreakdown.authorNamesPartial}件</span>
                </div>
                {importResult.skipped.totalItems > 0 && (
                  <div className={styles.skippedInfo}>
                    スキップされたアイテム: {importResult.skipped.totalItems}件
                    <div className={styles.skippedReasons}>
                      {importResult.skipped.reason.map((reason, index) => (
                        <div key={index}>{reason}</div>
                      ))}
                    </div>
                  </div>
                )}
                {importResult.overwritten && (
                  <div className={styles.overwriteInfo}>
                    ⚠️ 既存のNGリストが上書きされました
                  </div>
                )}
              </div>
              <div className={styles.reloadPrompt}>
                ⚠️ 変更を反映するにはページをリロードしてください
              </div>
            </div>
          ) : (
            <div>
              <strong>❌ インポートエラー</strong>
              <div className={styles.errorDetails}>
                {importResult.errors.map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}