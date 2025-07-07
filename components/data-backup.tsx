'use client'

import { useState } from 'react'
import { useUserNGList } from '@/hooks/use-user-ng-list'
import { useGenreOrder } from '@/hooks/use-genre-order'
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
import styles from './ng-backup.module.css'

// 統合バックアップデータの型定義
interface DataBackup {
  version: number
  ngList?: NGListBackupData['ngList']
  genreOrder?: {
    order: string[]
    hidden: string[]
  }
  exportedAt: string
  exportedFrom: string
}

export function DataBackup() {
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [exportType, setExportType] = useState<'all' | 'nglist' | 'genre'>('all')
  const [importResult, setImportResult] = useState<{
    ngList?: NGListImportResult
    genreOrder?: { success: boolean; message: string }
  } | null>(null)
  
  const { ngList } = useUserNGList()
  const { exportOrder: exportGenreOrder, importOrder: importGenreOrder } = useGenreOrder()

  // 統合エクスポート処理
  const handleExport = async () => {
    setIsExporting(true)
    try {
      let filename = ''
      let data: any
      
      if (exportType === 'nglist') {
        // NGリストのみ
        data = exportNGListData()
        filename = `ng-list-backup-${new Date().toISOString().split('T')[0]}.json`
      } else if (exportType === 'genre') {
        // ジャンル並び替えのみ
        const genreData = exportGenreOrder()
        data = {
          version: 1,
          genreOrder: genreData,
          exportedAt: new Date().toISOString(),
          exportedFrom: window.location.hostname
        }
        filename = `genre-order-backup-${new Date().toISOString().split('T')[0]}.json`
      } else {
        // 両方
        const ngData = exportNGListData()
        const genreData = exportGenreOrder()
        data = {
          version: 1,
          ngList: ngData.ngList,
          genreOrder: genreData,
          exportedAt: new Date().toISOString(),
          exportedFrom: window.location.hostname
        }
        filename = `settings-backup-${new Date().toISOString().split('T')[0]}.json`
      }
      
      // ダウンロード
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export failed:', error)
      alert(`エクスポートに失敗しました: ${error}`)
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
      const text = await file.text()
      const data = JSON.parse(text)
      
      const results: typeof importResult = {}
      
      // NGリストのインポート
      if (data.ngList) {
        try {
          const ngBackupData: NGListBackupData = {
            version: '1.0.0',
            exportDate: data.exportedAt || new Date().toISOString(),
            exportSource: 'settings-applied',
            ngList: data.ngList,
            metadata: {
              totalItems: data.ngList.totalCount,
              categoryBreakdown: {
                videoIds: data.ngList.videoIds.length,
                videoTitlesExact: data.ngList.videoTitles.exact.length,
                videoTitlesPartial: data.ngList.videoTitles.partial.length,
                authorIds: data.ngList.authorIds.length,
                authorNamesExact: data.ngList.authorNames.exact.length,
                authorNamesPartial: data.ngList.authorNames.partial.length
              },
              appVersion: '1.0.0'
            }
          }
          
          // 重複チェック
          const conflicts = detectConflicts(ngList, data.ngList)
          const result = await importNGListData(ngBackupData, conflicts.hasConflicts ? 'merge' : 'merge')
          results.ngList = result
        } catch (error) {
          results.ngList = {
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
            skipped: { totalItems: 0, reason: [] },
            errors: [error instanceof Error ? error.message : 'NGリストのインポートに失敗しました'],
            overwritten: false
          }
        }
      }
      
      // ジャンル並び替えのインポート
      if (data.genreOrder) {
        try {
          importGenreOrder(data.genreOrder)
          results.genreOrder = {
            success: true,
            message: 'ジャンル並び替え設定をインポートしました'
          }
        } catch (error) {
          results.genreOrder = {
            success: false,
            message: error instanceof Error ? error.message : 'ジャンル並び替えのインポートに失敗しました'
          }
        }
      }
      
      setImportResult(results)
      
      // 成功時はリロード促す
      if ((results.ngList?.success || results.genreOrder?.success)) {
        setTimeout(() => {
          if (confirm('インポートが完了しました。ページをリロードして変更を反映しますか？')) {
            window.location.reload()
          }
        }, 1500)
      }
    } catch (error) {
      setImportResult({
        ngList: {
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
          skipped: { totalItems: 0, reason: [] },
          errors: [error instanceof Error ? error.message : 'ファイルの読み込みに失敗しました'],
          overwritten: false
        }
      })
    } finally {
      setIsImporting(false)
      event.target.value = ''
    }
  }

  return (
    <div className={styles.ngBackup}>
      {/* エクスポートセクション */}
      <div style={{ marginBottom: '32px' }}>
        <h4 style={{ marginTop: 0, marginBottom: '16px' }}>エクスポート</h4>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', cursor: 'pointer' }}>
            <input
              type="radio"
              name="exportType"
              value="all"
              checked={exportType === 'all'}
              onChange={(e) => setExportType(e.target.value as 'all' | 'nglist' | 'genre')}
              style={{ marginRight: '8px' }}
            />
            すべての設定データ（NGリスト + ジャンル並び替え）
          </label>
          <label style={{ display: 'block', marginBottom: '8px', cursor: 'pointer' }}>
            <input
              type="radio"
              name="exportType"
              value="nglist"
              checked={exportType === 'nglist'}
              onChange={(e) => setExportType(e.target.value as 'all' | 'nglist' | 'genre')}
              style={{ marginRight: '8px' }}
            />
            NGリストのみ
          </label>
          <label style={{ display: 'block', cursor: 'pointer' }}>
            <input
              type="radio"
              name="exportType"
              value="genre"
              checked={exportType === 'genre'}
              onChange={(e) => setExportType(e.target.value as 'all' | 'nglist' | 'genre')}
              style={{ marginRight: '8px' }}
            />
            ジャンル並び替えのみ
          </label>
        </div>
        
        <button
          onClick={handleExport}
          disabled={isExporting}
          className={`${styles.backupButton} ${styles.exportButton}`}
          data-testid="export-data-button"
        >
          <svg className={styles.buttonIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8h3a2 2 0 002-2v-11a2 2 0 00-2-2h-3m-10 0H4a2 2 0 00-2 2v11a2 2 0 002 2h3" />
          </svg>
          {isExporting ? 'エクスポート中...' : 'エクスポート'}
        </button>
      </div>

      {/* インポートセクション */}
      <div>
        <h4 style={{ marginTop: 0, marginBottom: '16px' }}>インポート</h4>
        
        <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
          NGリスト、ジャンル並び替え、またはその両方を含むバックアップファイルをインポートできます。
        </p>
        
        <label className={`${styles.backupButton} ${styles.importButton}`} data-testid="import-data-button">
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
          {isImporting ? 'インポート中...' : 'インポート'}
        </label>
      </div>

      {/* インポート結果 */}
      {importResult && (
        <div 
          className={`${styles.importResult} ${
            (importResult.ngList?.success || importResult.genreOrder?.success) ? styles.success : styles.error
          }`}
        >
          {importResult.ngList && (
            <div style={{ marginBottom: importResult.genreOrder ? '12px' : 0 }}>
              <strong>{importResult.ngList.success ? '✅ NGリスト: ' : '❌ NGリスト: '}</strong>
              {importResult.ngList.success ? (
                <span>
                  {importResult.ngList.imported.totalItems}件追加
                  {importResult.ngList.skipped.totalItems > 0 && ` (${importResult.ngList.skipped.totalItems}件スキップ)`}
                </span>
              ) : (
                <span>{importResult.ngList.errors.join(', ')}</span>
              )}
            </div>
          )}
          
          {importResult.genreOrder && (
            <div>
              <strong>{importResult.genreOrder.success ? '✅ ジャンル並び替え: ' : '❌ ジャンル並び替え: '}</strong>
              <span>{importResult.genreOrder.message}</span>
            </div>
          )}
          
          {(importResult.ngList?.success || importResult.genreOrder?.success) && (
            <div className={styles.reloadPrompt}>
              ⚠️ 変更を反映するにはページをリロードしてください
            </div>
          )}
        </div>
      )}
    </div>
  )
}