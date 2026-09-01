'use client'

import { useState } from 'react'
import { useGenreOrderV2 } from '@/hooks/use-genre-order-v2'
import type { GenreItem } from '@/types/genre-order'
import styles from './genre-order-backup.module.css'
import { showToast } from '@/lib/toast'

interface BackupData {
  version: number
  exportDate: string
  genreOrder: GenreItem[]
}

export function GenreOrderBackup() {
  const { items } = useGenreOrderV2()
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false)
  const [importConfirmOpen, setImportConfirmOpen] = useState(false)
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [pendingImportData, setPendingImportData] = useState<BackupData | null>(null)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const data: BackupData = {
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
      setExportConfirmOpen(false)
    } catch (error) {
      console.error('Failed to export genre order:', error)
      showToast('ジャンル並び替えデータのエクスポートに失敗しました', 'error')
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
        const rawData = JSON.parse(content)
        
        let data: BackupData
        let genreOrderData: GenreItem[]
        
        // 統合バックアップファイルの判定と変換
        if (rawData.version && rawData.data && rawData.data.genreOrder) {
          // 統合バックアップからジャンル並び替えデータを抽出
          genreOrderData = rawData.data.genreOrder
          data = {
            version: rawData.version,
            exportDate: rawData.exportDate,
            genreOrder: genreOrderData
          }
        } else if (rawData.version && rawData.genreOrder && Array.isArray(rawData.genreOrder)) {
          // 個別ジャンル並び替えバックアップファイル
          data = rawData as BackupData
          genreOrderData = data.genreOrder
        } else if (rawData.genreOrder && Array.isArray(rawData.genreOrder)) {
          // 古い形式（versionなし）もサポート
          genreOrderData = rawData.genreOrder
          data = {
            version: 1,
            exportDate: new Date().toISOString(),
            genreOrder: genreOrderData
          }
        } else {
          throw new Error('ジャンル並び替えデータが含まれていません')
        }

        // 各アイテムのバリデーション
        for (const item of genreOrderData) {
          if (!item.id || typeof item.isVisible !== 'boolean' || typeof item.order !== 'number') {
            throw new Error('無効なジャンルデータが含まれています')
          }
        }

        // 確認ダイアログを表示
        setPendingImportData(data)
        setImportConfirmOpen(true)
      } catch (error) {
        console.error('Failed to import genre order:', error)
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
      // LocalStorageに保存
      localStorage.setItem('nicoRankingGenreOrder', JSON.stringify(pendingImportData.genreOrder))
      
      setImportMessage({ 
        type: 'success', 
        text: 'ジャンル並び替えデータをインポートしました。' 
      })
      setImportConfirmOpen(false)
      setPendingImportData(null)
      
      // リロード確認
      // 二重通知をやめてトースト+自動リロードに一本化（フェーズ5-4）
      showToast('インポートしました。反映のため再読み込みします…', 'success')
      setTimeout(() => {
        window.location.reload()
      }, 1800)
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
          onClick={() => setExportConfirmOpen(true)}
          disabled={isExporting}
          className={`${styles.backupButton} ${styles.exportButton}`}
          data-testid="export-genre-order-button"
        >
          <svg className={styles.buttonIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8h3a2 2 0 002-2v-11a2 2 0 00-2-2h-3m-10 0H4a2 2 0 00-2 2v11a2 2 0 002 2h3" />
          </svg>
          エクスポート
        </button>
        
        {/* インポートボタン */}
        <label className={`${styles.backupButton} ${styles.importButton}`} data-testid="import-genre-order-button">
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
            <h3>ジャンル並び替えデータをエクスポート</h3>
            <p>現在のジャンル並び替え設定をJSON形式でダウンロードします。</p>
            <div className={styles.exportStats}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>ジャンル数:</span>
                <span className={styles.statValue}>{items.length}件</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>表示中:</span>
                <span className={styles.statValue}>{items.filter(item => item.isVisible).length}件</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>非表示:</span>
                <span className={styles.statValue}>{items.filter(item => !item.isVisible).length}件</span>
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

      {/* インポート確認ダイアログ */}
      {importConfirmOpen && pendingImportData && (
        <div className={styles.backupDialogOverlay} onClick={() => setImportConfirmOpen(false)}>
          <div 
            className={styles.backupDialog} 
            onClick={(e) => e.stopPropagation()}
            data-testid="import-confirm-dialog"
          >
            <h3>ジャンル並び替えデータをインポート</h3>
            <p>
              選択されたバックアップファイルからジャンル並び替え設定を復元します。
            </p>
            
            <div className={styles.importInfo}>
              <div>バックアップ日時: {new Date(pendingImportData.exportDate).toLocaleString('ja-JP')}</div>
              <div>ジャンル数: {pendingImportData.genreOrder.length}項目</div>
            </div>

            <div className={styles.warningInfo}>
              ⚠️ 現在のジャンル並び替え設定は完全に上書きされます。
            </div>

            <p className={styles.dialogNote}>
              この操作は取り消すことができません。必要に応じて現在の設定をエクスポートしてバックアップを取ってください。
            </p>

            <div className={styles.dialogActions}>
              <button 
                onClick={() => {
                  setImportConfirmOpen(false)
                  setPendingImportData(null)
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