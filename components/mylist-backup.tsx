'use client'

import { useState } from 'react'
import { 
  exportMylistData, 
  downloadBackupData, 
  readBackupFile, 
  importMylistData,
  detectMylistConflicts,
  type BackupData,
  type MylistConflictDetectionResult,
  type MylistImportResult
} from '@/lib/storage/backup'
import styles from './mylist-backup.module.css'

export function MylistBackup() {
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false)
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
  const [importResult, setImportResult] = useState<MylistImportResult | null>(null)
  const [conflictData, setConflictData] = useState<{
    backup: BackupData
    conflicts: MylistConflictDetectionResult
  } | null>(null)

  // エクスポート処理
  const handleExport = async () => {
    setIsExporting(true)
    try {
      const data = await exportMylistData()
      downloadBackupData(data)
      setExportConfirmOpen(false)
    } catch (error) {
      console.error('Export failed:', error)
      alert('エクスポートに失敗しました')
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
      const data = await readBackupFile(file)
      
      // 重複検出
      const conflicts = await detectMylistConflicts(data)
      
      if (conflicts.hasConflicts) {
        // 重複がある場合は確認ダイアログを表示
        setConflictData({ backup: data, conflicts })
        setConflictDialogOpen(true)
      } else {
        // 重複がない場合は直接インポート（デフォルト：安全追加）
        const result = await importMylistData(data, 'safe_add')
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
          mylists: 0,
          videos: 0
        },
        created: {
          mylists: 0,
          videos: 0
        },
        overwritten: {
          mylists: 0,
          videos: 0
        },
        skipped: {
          mylists: 0,
          videos: 0,
          reason: []
        },
        renamed: {
          mylists: []
        },
        errors: [error instanceof Error ? error.message : 'インポートに失敗しました']
      })
    } finally {
      setIsImporting(false)
      // ファイル入力をリセット
      event.target.value = ''
    }
  }

  // 重複処理選択時のインポート実行
  const handleConflictResolution = async (resolution: 'safe_add' | 'smart_merge' | 'complete_overwrite') => {
    if (!conflictData) return

    setIsImporting(true)
    try {
      const result = await importMylistData(conflictData.backup, resolution)
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
          mylists: 0,
          videos: 0
        },
        created: {
          mylists: 0,
          videos: 0
        },
        overwritten: {
          mylists: 0,
          videos: 0
        },
        skipped: {
          mylists: 0,
          videos: 0,
          reason: []
        },
        renamed: {
          mylists: []
        },
        errors: [error instanceof Error ? error.message : 'インポート処理に失敗しました']
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className={styles.mylistBackup}>
      <div className={styles.backupActions}>
        {/* エクスポートボタン */}
        <button
          onClick={() => setExportConfirmOpen(true)}
          disabled={isExporting}
          className={`${styles.backupButton} ${styles.exportButton}`}
          data-testid="export-mylists-button"
        >
          <svg className={styles.buttonIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8h3a2 2 0 002-2v-11a2 2 0 00-2-2h-3m-10 0H4a2 2 0 00-2 2v11a2 2 0 002 2h3" />
          </svg>
          エクスポート
        </button>

        {/* インポートボタン */}
        <label className={`${styles.backupButton} ${styles.importButton}`} data-testid="import-mylists-button">
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            disabled={isImporting}
            className={styles.fileInput}
            data-testid="import-file-input"
          />
          <svg className={styles.buttonIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v6m0 0l-3-3m3 3l3-3m2 8h3a2 2 0 012 2v3a2 2 0 01-2 2h-3m-10 0H4a2 2 0 01-2-2v-3a2 2 0 012-2h3" />
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
            <h3>マイリストをエクスポート</h3>
            <p>すべてのマイリストデータをJSON形式でダウンロードします。</p>
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
            data-testid="mylist-conflict-resolution-dialog"
          >
            <h3>⚠️ 重複するマイリストが見つかりました</h3>
            
            <div className={styles.conflictSummary}>
              <div className={styles.importStats}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>インポート対象:</span>
                  <span className={styles.statValue}>
                    {conflictData.conflicts.summary.importingMylists}マイリスト, {conflictData.conflicts.summary.importingVideos}動画
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>競合検出:</span>
                  <span className={styles.statValue}>
                    {conflictData.conflicts.summary.totalConflictingMylists}マイリスト, {conflictData.conflicts.summary.totalConflictingVideos}動画
                  </span>
                </div>
              </div>

              {conflictData.conflicts.conflicts.mylistIds.length > 0 && (
                <div className={styles.conflictDetail}>
                  <div className={styles.conflictType}>🔄 ID重複マイリスト ({conflictData.conflicts.conflicts.mylistIds.length}件)</div>
                  <div className={styles.conflictList}>
                    {conflictData.conflicts.conflicts.mylistIds.slice(0, 3).map((conflict, index) => (
                      <div key={index} className={styles.conflictItem}>
                        「{conflict.existingName}」→「{conflict.importingName}」
                        <small>({conflict.existingVideoCount}→{conflict.importingVideoCount}動画)</small>
                      </div>
                    ))}
                    {conflictData.conflicts.conflicts.mylistIds.length > 3 && (
                      <div className={styles.moreConflicts}>...他{conflictData.conflicts.conflicts.mylistIds.length - 3}件</div>
                    )}
                  </div>
                </div>
              )}

              {conflictData.conflicts.conflicts.mylistNames.length > 0 && (
                <div className={styles.conflictDetail}>
                  <div className={styles.conflictType}>📝 名前重複マイリスト ({conflictData.conflicts.conflicts.mylistNames.length}件)</div>
                  <div className={styles.conflictList}>
                    {conflictData.conflicts.conflicts.mylistNames.slice(0, 3).map((conflict, index) => (
                      <div key={index} className={styles.conflictItem}>
                        「{conflict.name}」
                        <small>({conflict.existingVideoCount}動画 + {conflict.importingVideoCount}動画)</small>
                      </div>
                    ))}
                    {conflictData.conflicts.conflicts.mylistNames.length > 3 && (
                      <div className={styles.moreConflicts}>...他{conflictData.conflicts.conflicts.mylistNames.length - 3}件</div>
                    )}
                  </div>
                </div>
              )}

              {conflictData.conflicts.conflicts.videos.length > 0 && (
                <div className={styles.conflictDetail}>
                  <div className={styles.conflictType}>🎬 動画重複 ({conflictData.conflicts.conflicts.videos.length}件)</div>
                  <div className={styles.conflictList}>
                    {conflictData.conflicts.conflicts.videos.slice(0, 2).map((conflict, index) => (
                      <div key={index} className={styles.conflictItem}>
                        「{conflict.title}」
                        <small>
                          {conflict.conflictType === 'same_mylist' 
                            ? `同一マイリスト「${conflict.existingMylistName}」内` 
                            : `「${conflict.existingMylistName}」⇔「${conflict.importingMylistName}」間`
                          }
                        </small>
                      </div>
                    ))}
                    {conflictData.conflicts.conflicts.videos.length > 2 && (
                      <div className={styles.moreConflicts}>...他{conflictData.conflicts.conflicts.videos.length - 2}件</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.resolutionOptions}>
              <p className={styles.resolutionTitle}>どのように処理しますか？</p>
              
              <label className={styles.resolutionOption}>
                <input type="radio" name="mylist-resolution" value="safe_add" defaultChecked />
                <div className={styles.optionContent}>
                  <span className={styles.optionTitle}>🔒 安全追加（推奨）</span>
                  <span className={styles.optionDescription}>
                    既存データを保護し、重複は自動リネーム・新ID生成で追加
                  </span>
                </div>
              </label>
              
              <label className={styles.resolutionOption}>
                <input type="radio" name="mylist-resolution" value="smart_merge" />
                <div className={styles.optionContent}>
                  <span className={styles.optionTitle}>🔄 スマートマージ</span>
                  <span className={styles.optionDescription}>
                    ID重複は上書き、名前重複は別マイリスト作成、動画は適切に統合
                  </span>
                </div>
              </label>
              
              <label className={styles.resolutionOption}>
                <input type="radio" name="mylist-resolution" value="complete_overwrite" />
                <div className={styles.optionContent}>
                  <span className={styles.optionTitle}>⚠️ 完全上書き（上級者向け）</span>
                  <span className={styles.optionDescription}>
                    既存マイリストを全削除してインポートデータで完全置換
                  </span>
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
                  const selected = document.querySelector('input[name="mylist-resolution"]:checked') as HTMLInputElement
                  if (selected) {
                    handleConflictResolution(selected.value as 'safe_add' | 'smart_merge' | 'complete_overwrite')
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
              {importResult.message && <div className={styles.resultMessage}>{importResult.message}</div>}
              <div className={styles.resultDetails}>
                <div>追加されたマイリスト: {importResult.created.mylists}件</div>
                <div>追加された動画: {importResult.created.videos}件</div>
                {importResult.overwritten.mylists > 0 && (
                  <div>上書きされたマイリスト: {importResult.overwritten.mylists}件</div>
                )}
                {importResult.overwritten.videos > 0 && (
                  <div>上書きされた動画: {importResult.overwritten.videos}件</div>
                )}
                {importResult.renamed.mylists.length > 0 && (
                  <div className={styles.renamedInfo}>
                    リネームされたマイリスト: {importResult.renamed.mylists.length}件
                    <div className={styles.renamedList}>
                      {importResult.renamed.mylists.slice(0, 3).map((renamed, index) => (
                        <div key={index}>「{renamed.original}」→「{renamed.renamed}」</div>
                      ))}
                      {importResult.renamed.mylists.length > 3 && (
                        <div>...他{importResult.renamed.mylists.length - 3}件</div>
                      )}
                    </div>
                  </div>
                )}
                {importResult.skipped.mylists + importResult.skipped.videos > 0 && (
                  <div className={styles.skippedInfo}>
                    スキップされたアイテム: {importResult.skipped.mylists + importResult.skipped.videos}件
                    <div className={styles.skippedReasons}>
                      {importResult.skipped.reason.map((reason, index) => (
                        <div key={index}>{reason}</div>
                      ))}
                    </div>
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