'use client'

import { useState } from 'react'
import { exportMylistData, downloadBackupData, readBackupFile, importMylistData } from '@/lib/storage/backup'
import type { BackupData } from '@/lib/storage/backup'

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
        setImportResult({
          success: true,
          message: `インポート完了: ${result.imported.mylists}個のマイリスト、${result.imported.videos}個の動画`
        })
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
    <div className="mylist-backup">
      <div className="backup-actions">
        {/* エクスポートボタン */}
        <button
          onClick={() => setExportConfirmOpen(true)}
          disabled={isExporting}
          className="backup-button export-button"
          data-testid="export-mylists-button"
        >
          <svg className="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8h3a2 2 0 002-2v-11a2 2 0 00-2-2h-3m-10 0H4a2 2 0 00-2 2v11a2 2 0 002 2h3" />
          </svg>
          エクスポート
        </button>

        {/* インポートボタン */}
        <label className="backup-button import-button" data-testid="import-mylists-button">
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            disabled={isImporting}
            className="file-input"
            data-testid="import-file-input"
          />
          <svg className="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v6m0 0l-3-3m3 3l3-3m2 8h3a2 2 0 012 2v3a2 2 0 01-2 2h-3m-10 0H4a2 2 0 01-2-2v-3a2 2 0 012-2h3" />
          </svg>
          インポート
        </label>
      </div>

      {/* エクスポート確認ダイアログ */}
      {exportConfirmOpen && (
        <div className="backup-dialog-overlay" onClick={() => setExportConfirmOpen(false)}>
          <div 
            className="backup-dialog" 
            onClick={(e) => e.stopPropagation()}
            data-testid="export-confirm-dialog"
          >
            <h3>マイリストをエクスポート</h3>
            <p>すべてのマイリストデータをJSON形式でダウンロードします。</p>
            <p className="dialog-note">このファイルは他のデバイスへの移行やバックアップに使用できます。</p>
            <div className="dialog-actions">
              <button 
                onClick={() => setExportConfirmOpen(false)}
                className="dialog-button cancel-button"
              >
                キャンセル
              </button>
              <button 
                onClick={handleExport}
                disabled={isExporting}
                className="dialog-button confirm-button"
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
          className={`import-result ${importResult.success ? 'success' : 'error'}`}
          data-testid={importResult.success ? 'import-success-message' : 'import-error-message'}
        >
          {importResult.message}
        </div>
      )}

      <style jsx>{`
        .mylist-backup {
          margin: 1rem 0;
        }

        .backup-actions {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .backup-button {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .backup-button:hover:not(:disabled) {
          background: var(--bg-hover);
          border-color: var(--primary-color);
        }

        .backup-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .button-icon {
          width: 20px;
          height: 20px;
        }

        .file-input {
          display: none;
        }

        .backup-dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .backup-dialog {
          background: var(--surface-color);
          border-radius: 12px;
          padding: 1.5rem;
          max-width: 400px;
          width: 100%;
          box-shadow: var(--shadow-xl);
          animation: modalSlideIn 0.2s ease-out;
        }
        
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .backup-dialog h3 {
          margin: 0 0 1rem;
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
          padding-bottom: 0.75rem;
          border-bottom: 1px solid var(--border-color);
        }

        .backup-dialog p {
          margin: 0.5rem 0;
          color: var(--text-primary);
          line-height: 1.5;
        }

        .dialog-note {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .dialog-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          margin-top: 1.5rem;
        }

        .dialog-button {
          padding: 0.5rem 1.25rem;
          border: none;
          border-radius: 6px;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cancel-button {
          background: var(--surface-secondary);
          color: var(--text-primary);
        }

        .cancel-button:hover {
          background: var(--surface-hover);
        }

        .confirm-button {
          background: var(--primary-color);
          color: white;
        }

        .confirm-button:hover:not(:disabled) {
          background: var(--primary-color-hover);
          transform: translateY(-1px);
        }

        .confirm-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .import-result {
          margin-top: 1rem;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          font-size: 0.9rem;
        }

        .import-result.success {
          background: rgba(34, 197, 94, 0.1);
          color: rgb(34, 197, 94);
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .import-result.error {
          background: rgba(239, 68, 68, 0.1);
          color: rgb(239, 68, 68);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        @media (max-width: 768px) {
          .backup-dialog {
            padding: 1.5rem;
          }

          .backup-actions {
            justify-content: center;
          }

          .backup-button {
            flex: 1;
            justify-content: center;
            min-width: 140px;
          }
        }
      `}</style>
    </div>
  )
}