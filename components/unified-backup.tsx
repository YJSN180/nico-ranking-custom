'use client'

import { useState } from 'react'
import { useUserNGListExtended } from '@/hooks/use-user-ng-list-extended'
import { useGenreOrderV2 } from '@/hooks/use-genre-order-v2'
import { useCustomRankings } from '@/hooks/use-custom-rankings'
import { DBManager } from '@/lib/storage/db-manager'
import type { GenreItem } from '@/types/genre-order'
import type { CustomRankingWithConditions } from '@/lib/storage/types'
import type { ExtendedNGListBackupData } from '@/lib/storage/ng-backup-extended'
import type { BackupData as MylistBackupData } from '@/lib/storage/backup'
import { 
  exportExtendedNGListData, 
  importExtendedNGListData,
  detectExtendedConflicts
} from '@/lib/storage/ng-backup-extended'
import { exportMylistData, importMylistData, detectMylistConflicts } from '@/lib/storage/backup'
import { CustomRankingManager } from '@/lib/storage/custom-rankings'
import styles from './genre-order-backup.module.css'

// 統合バックアップデータ構造
interface UnifiedBackupData {
  version: number
  exportDate: string
  appVersion: string
  data: {
    ngList?: ExtendedNGListBackupData
    genreOrder?: GenreItem[]
    customRankings?: CustomRankingWithConditions[]
    mylists?: MylistBackupData
  }
}

export function UnifiedBackup() {
  const { ngList } = useUserNGListExtended()
  const { items: genreOrderItems } = useGenreOrderV2()
  const { rankings: customRankings } = useCustomRankings()
  
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false)
  const [importConfirmOpen, setImportConfirmOpen] = useState(false)
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [pendingImportData, setPendingImportData] = useState<UnifiedBackupData | null>(null)
  const [availableDataTypes, setAvailableDataTypes] = useState<string[]>([])

  const handleExport = async () => {
    setIsExporting(true)
    try {
      // エクスポートデータを初期化
      const data: UnifiedBackupData = {
        version: 1,
        exportDate: new Date().toISOString(),
        appVersion: '1.0.0', // TODO: 実際のアプリバージョンを取得
        data: {}
      }
      
      // 各データを個別にエクスポート（エラーが発生しても他のデータは保存）
      try {
        const ngListData = exportExtendedNGListData()
        data.data.ngList = ngListData
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to export NG list:', error)
      }
      
      try {
        data.data.genreOrder = genreOrderItems
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to export genre order:', error)
      }
      
      try {
        data.data.customRankings = customRankings
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to export custom rankings:', error)
      }
      
      try {
        const mylistData = await exportMylistData()
        data.data.mylists = mylistData
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to export mylist data:', error)
        // マイリストのエクスポートに失敗した場合でも続行
      }
      
      // エクスポート可能なデータがあるか確認
      if (Object.keys(data.data).length === 0) {
        throw new Error('エクスポート可能なデータがありません')
      }
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nico-ranking-backup-all-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      // エクスポートされたデータの種類を通知
      const exportedTypes: string[] = []
      if (data.data.ngList) exportedTypes.push('NGリスト')
      if (data.data.genreOrder) exportedTypes.push('ジャンル並び替え')
      if (data.data.customRankings) exportedTypes.push('カスタムランキング')
      if (data.data.mylists) exportedTypes.push('マイリスト')
      
      // eslint-disable-next-line no-console
      console.log(`エクスポート完了: ${exportedTypes.join(', ')}`)
      setExportConfirmOpen(false)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to export unified backup:', error)
      const errorMessage = error instanceof Error ? error.message : '不明なエラー'
      alert(`統合バックアップのエクスポートに失敗しました: ${errorMessage}`)
      
      // 詳細なエラー情報をコンソールに出力
      if (error instanceof Error) {
        // eslint-disable-next-line no-console
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        })
      }
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
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string
        const rawData = JSON.parse(content)
        
        // 統合バックアップか個別バックアップかを判定
        let data: UnifiedBackupData
        
        if (rawData.version && rawData.data) {
          // 統合バックアップファイル
          data = rawData as UnifiedBackupData
        } else {
          // 個別バックアップファイルを統合形式に変換
          data = {
            version: 1,
            exportDate: new Date().toISOString(),
            appVersion: '1.0.0',
            data: {}
          }
          
          // NGリストバックアップの判定
          if (rawData.ngList && rawData.metadata && rawData.version) {
            data.data.ngList = rawData
          }
          // ジャンル並び替えバックアップの判定
          else if (rawData.genreOrder && Array.isArray(rawData.genreOrder)) {
            data.data.genreOrder = rawData.genreOrder
          }
          // カスタムランキングバックアップの判定
          else if (rawData.customRankings && Array.isArray(rawData.customRankings)) {
            data.data.customRankings = rawData.customRankings
          }
          // マイリストバックアップの判定
          else if (rawData.mylists && rawData.mylistVideos && rawData.metadata) {
            data.data.mylists = rawData
          } else {
            throw new Error('認識できないバックアップファイル形式です')
          }
        }

        // 利用可能なデータタイプを確認
        const available: string[] = []
        if (data.data.ngList) available.push('NGリスト')
        if (data.data.genreOrder) available.push('ジャンル並び替え')
        if (data.data.customRankings) available.push('カスタムランキング')
        if (data.data.mylists) available.push('マイリスト')
        
        if (available.length === 0) {
          throw new Error('インポート可能なデータが含まれていません')
        }
        
        setAvailableDataTypes(available)
        setPendingImportData(data)
        setImportConfirmOpen(true)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to import unified backup:', error)
        setImportMessage({ 
          type: 'error', 
          text: error instanceof Error ? error.message : 'インポートに失敗しました' 
        })
      } finally {
        setIsImporting(false)
      }
    }
    
    reader.readAsText(file)
    event.target.value = ''
  }

  const confirmImport = async () => {
    if (!pendingImportData) return

    setIsImporting(true)
    const results: string[] = []
    const errors: string[] = []

    try {
      // NGリストのインポート
      if (pendingImportData.data.ngList) {
        try {
          const conflicts = detectExtendedConflicts(ngList, pendingImportData.data.ngList.ngList)
          const result = await importExtendedNGListData(pendingImportData.data.ngList, 'merge')
          results.push(`✅ NGリスト: ${result.imported.totalItems}件インポート`)
        } catch (error) {
          errors.push(`❌ NGリスト: ${error instanceof Error ? error.message : 'エラー'}`)
        }
      }

      // ジャンル並び替えのインポート
      if (pendingImportData.data.genreOrder) {
        try {
          localStorage.setItem('nicoRankingGenreOrder', JSON.stringify(pendingImportData.data.genreOrder))
          results.push(`✅ ジャンル並び替え: ${pendingImportData.data.genreOrder.length}件設定`)
        } catch (error) {
          errors.push(`❌ ジャンル並び替え: ${error instanceof Error ? error.message : 'エラー'}`)
        }
      }

      // カスタムランキングのインポート
      if (pendingImportData.data.customRankings) {
        try {
          const dbManager = new DBManager()
          await dbManager.init()
          const rankingManager = new CustomRankingManager(dbManager)
          
          let importedCount = 0
          for (const ranking of pendingImportData.data.customRankings) {
            const existing = customRankings.find(r => r.title === ranking.title)
            if (existing) {
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
            } else {
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
            }
            importedCount++
          }
          results.push(`✅ カスタムランキング: ${importedCount}件インポート`)
        } catch (error) {
          errors.push(`❌ カスタムランキング: ${error instanceof Error ? error.message : 'エラー'}`)
        }
      }

      // マイリストのインポート
      if (pendingImportData.data.mylists) {
        try {
          const conflicts = await detectMylistConflicts(pendingImportData.data.mylists)
          const result = await importMylistData(pendingImportData.data.mylists, 'safe_add')
          results.push(`✅ マイリスト: ${result.created.mylists}件, 動画${result.created.videos}件インポート`)
        } catch (error) {
          errors.push(`❌ マイリスト: ${error instanceof Error ? error.message : 'エラー'}`)
        }
      }

      // 結果メッセージの設定
      if (errors.length === 0) {
        setImportMessage({ 
          type: 'success', 
          text: `インポート完了:\n${results.join('\n')}` 
        })
      } else if (results.length > 0) {
        setImportMessage({ 
          type: 'error', 
          text: `一部インポート完了:\n${results.join('\n')}\n\nエラー:\n${errors.join('\n')}` 
        })
      } else {
        setImportMessage({ 
          type: 'error', 
          text: `インポート失敗:\n${errors.join('\n')}` 
        })
      }
      
      setImportConfirmOpen(false)
      setPendingImportData(null)
      
      // リロード確認
      if (results.length > 0) {
        setTimeout(() => {
          if (confirm('インポートが完了しました。ページをリロードして変更を反映しますか？')) {
            window.location.reload()
          }
        }, 1500)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
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
          data-testid="export-unified-button"
        >
          <svg className={styles.buttonIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8h3a2 2 0 002-2v-11a2 2 0 00-2-2h-3m-10 0H4a2 2 0 00-2 2v11a2 2 0 002 2h3" />
          </svg>
          まとめてエクスポート
        </button>
        
        {/* インポートボタン */}
        <label className={`${styles.backupButton} ${styles.importButton}`} data-testid="import-unified-button">
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
          まとめてインポート
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
            <h3>統合バックアップをエクスポート</h3>
            <p>
              すべての設定データ（NGリスト、ジャンル並び替え、カスタムランキング、マイリスト）を一つのファイルにまとめてJSON形式でダウンロードします。
            </p>
            
            <div className={styles.exportStats}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>NGリスト:</span>
                <span className={styles.statValue}>{ngList.totalCount}件</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>ジャンル並び替え:</span>
                <span className={styles.statValue}>{genreOrderItems.length}件</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>カスタムランキング:</span>
                <span className={styles.statValue}>{customRankings.length}件</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>マイリスト:</span>
                <span className={styles.statValue}>データベースから取得</span>
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
            <h3>統合バックアップをインポート</h3>
            <p>
              選択されたバックアップファイルから以下のデータを復元します。
            </p>
            
            <div className={styles.importInfo}>
              <div>バックアップ日時: {new Date(pendingImportData.exportDate).toLocaleString('ja-JP')}</div>
              <div>アプリバージョン: {pendingImportData.appVersion}</div>
              <div style={{ marginTop: '10px', fontWeight: 'bold' }}>含まれるデータ:</div>
              <ul style={{ marginLeft: '20px', marginTop: '5px' }}>
                {availableDataTypes.map(type => (
                  <li key={type}>✅ {type}</li>
                ))}
              </ul>
            </div>

            <div className={styles.warningInfo}>
              ⚠️ 各データは既存のデータとマージされます。
              <br />
              重複する項目は自動的に処理されます。
            </div>

            <p className={styles.dialogNote}>
              インポート後、変更を反映するにはページのリロードが必要です。
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
          style={{ whiteSpace: 'pre-line' }}
        >
          {importMessage.text}
        </div>
      )}
    </div>
  )
}