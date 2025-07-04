'use client'

import { useState } from 'react'
import { exportMylistData, downloadBackupData, readBackupFile, importMylistData } from '@/lib/storage/backup'
import type { BackupData } from '@/lib/storage/backup'
import styles from './mylist-backup.module.css'

export function MylistBackup() {
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false)
  const [importResult, setImportResult] = useState<{
    success: boolean
    message: string
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

  // インポート処理
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setImportResult(null)

    try {
      const data = await readBackupFile(file)
      const result = await importMylistData(data)

      if (result.success) {
        let message = `インポート完了: ${result.imported.mylists}個のマイリスト、${result.imported.videos}個の動画`
        if (result.overwritten > 0) {
          message += `\n（うち${result.overwritten}個のマイリストが上書きされました）`
        }
        message += '\n\n⚠️ 変更を反映するにはページをリロードしてください'
        
        setImportResult({
          success: true,
          message
        })
        // 3秒後にリロードを促すボタンを表示
        setTimeout(() => {
          if (confirm('インポートが完了しました。ページをリロードして変更を反映しますか？')) {
            window.location.reload()
          }
        }, 1500)
      } else {
        setImportResult({
          success: false,
          message: `インポート中にエラーが発生しました: ${result.errors.join(', ')}`
        })
      }
    } catch (error) {
      setImportResult({
        success: false,
        message: error instanceof Error ? error.message : 'インポートに失敗しました'
      })
    } finally {
      setIsImporting(false)
      // ファイル入力をリセット
      event.target.value = ''
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

      {/* インポート結果メッセージ */}
      {importResult && (
        <div 
          className={`${styles.importResult} ${importResult.success ? styles.success : styles.error}`}
          data-testid={importResult.success ? 'import-success-message' : 'import-error-message'}
        >
          {importResult.message}
        </div>
      )}
    </div>
  )
}