'use client'

import { useEffect, useState } from 'react'
import { 
  shouldShowBackupReminder, 
  markReminderShown,
  getReminderSettings,
  saveReminderSettings,
  saveLastAccessTime,
  getLastAccessTime,
  getDaysSinceLastAccess,
  type ReminderSettings
} from '@/lib/storage/persistence'
import { exportMylistData, downloadBackupData } from '@/lib/storage/backup'

export function BackupReminder() {
  const [showReminder, setShowReminder] = useState(false)
  const [settings, setSettings] = useState<ReminderSettings>(() => getReminderSettings())
  const [showSettings, setShowSettings] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    // 最終アクセス時刻を更新
    saveLastAccessTime()

    // リマインダーを表示すべきか確認
    if (shouldShowBackupReminder()) {
      // 少し遅延させてから表示（UXの改善）
      const timer = setTimeout(() => {
        setShowReminder(true)
        markReminderShown()
      }, 3000)
      
      return () => clearTimeout(timer)
    }
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      const data = await exportMylistData()
      downloadBackupData(data)
      setShowReminder(false)
    } catch (error) {
      alert('バックアップに失敗しました')
    } finally {
      setExporting(false)
    }
  }

  const handleSettingsChange = (newSettings: ReminderSettings) => {
    setSettings(newSettings)
    saveReminderSettings(newSettings)
    setShowSettings(false)
  }

  const handleDismiss = () => {
    setShowReminder(false)
  }

  if (!showReminder) {
    return null
  }

  return (
    <>
      <div className="backup-reminder" data-testid="backup-reminder">
        <div className="reminder-content">
          <div className="reminder-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="reminder-text">
            <h4>マイリストのバックアップを推奨します</h4>
            <p>大切なデータを保護するため、定期的なバックアップをお勧めします。</p>
          </div>
          <div className="reminder-actions">
            <button 
              onClick={handleExport}
              disabled={exporting}
              className="backup-now-button"
            >
              {exporting ? 'バックアップ中...' : '今すぐバックアップ'}
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="settings-button"
              data-testid="reminder-settings-button"
            >
              設定
            </button>
            <button 
              onClick={handleDismiss}
              className="dismiss-button"
            >
              後で
            </button>
          </div>
        </div>
      </div>

      {showSettings && (
        <ReminderSettingsModal
          settings={settings}
          onSave={handleSettingsChange}
          onCancel={() => setShowSettings(false)}
        />
      )}

      <style jsx>{`
        .backup-reminder {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          max-width: 400px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
          padding: 1.5rem;
          z-index: 1000;
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .reminder-content {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .reminder-icon {
          width: 40px;
          height: 40px;
          color: var(--primary-color);
        }

        .reminder-text h4 {
          margin: 0 0 0.25rem;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .reminder-text p {
          margin: 0;
          font-size: 0.875rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .reminder-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .backup-now-button,
        .settings-button,
        .dismiss-button {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .backup-now-button {
          background: var(--primary-color);
          color: white;
        }

        .backup-now-button:hover:not(:disabled) {
          opacity: 0.9;
        }

        .backup-now-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .settings-button {
          background: var(--bg-secondary);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
        }

        .settings-button:hover {
          background: var(--bg-hover);
        }

        .dismiss-button {
          background: transparent;
          color: var(--text-secondary);
        }

        .dismiss-button:hover {
          color: var(--text-primary);
        }

        @media (max-width: 768px) {
          .backup-reminder {
            bottom: 1rem;
            right: 1rem;
            left: 1rem;
            max-width: none;
          }

          .reminder-actions {
            flex-direction: column;
          }

          .backup-now-button,
          .settings-button,
          .dismiss-button {
            width: 100%;
          }
        }
      `}</style>
    </>
  )
}

function ReminderSettingsModal({ 
  settings, 
  onSave, 
  onCancel 
}: {
  settings: ReminderSettings
  onSave: (settings: ReminderSettings) => void
  onCancel: () => void
}) {
  const [localSettings, setLocalSettings] = useState(settings)

  return (
    <div className="settings-overlay" onClick={onCancel}>
      <div 
        className="settings-modal" 
        onClick={(e) => e.stopPropagation()}
        data-testid="reminder-settings-modal"
      >
        <h3>バックアップリマインダー設定</h3>
        
        <div className="settings-options">
          <label className="settings-option">
            <input
              type="radio"
              name="interval"
              checked={localSettings.intervalDays === 3}
              onChange={() => setLocalSettings({ ...localSettings, intervalDays: 3 })}
              data-testid="reminder-interval-3days"
            />
            <span>3日ごと</span>
          </label>
          
          <label className="settings-option">
            <input
              type="radio"
              name="interval"
              checked={localSettings.intervalDays === 5}
              onChange={() => setLocalSettings({ ...localSettings, intervalDays: 5 })}
              data-testid="reminder-interval-5days"
            />
            <span>5日ごと（推奨）</span>
          </label>
          
          <label className="settings-option">
            <input
              type="radio"
              name="interval"
              checked={localSettings.intervalDays === 7}
              onChange={() => setLocalSettings({ ...localSettings, intervalDays: 7 })}
              data-testid="reminder-interval-7days"
            />
            <span>7日ごと</span>
          </label>
          
          <label className="settings-option">
            <input
              type="radio"
              name="interval"
              checked={!localSettings.enabled}
              onChange={() => setLocalSettings({ ...localSettings, enabled: false })}
              data-testid="reminder-interval-off"
            />
            <span>リマインダーを無効にする</span>
          </label>
        </div>

        <div className="modal-actions">
          <button onClick={onCancel} className="cancel-button">
            キャンセル
          </button>
          <button 
            onClick={() => onSave({ 
              ...localSettings, 
              enabled: localSettings.intervalDays !== undefined && localSettings.enabled !== false 
            })}
            className="save-button"
          >
            保存
          </button>
        </div>

        <style jsx>{`
          .settings-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            padding: 1rem;
          }

          .settings-modal {
            background: var(--bg-primary);
            border-radius: 12px;
            padding: 2rem;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          }

          .settings-modal h3 {
            margin: 0 0 1.5rem;
            font-size: 1.25rem;
            color: var(--text-primary);
          }

          .settings-options {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            margin-bottom: 2rem;
          }

          .settings-option {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            cursor: pointer;
          }

          .settings-option input[type="radio"] {
            cursor: pointer;
          }

          .settings-option span {
            color: var(--text-primary);
            font-size: 0.9rem;
          }

          .modal-actions {
            display: flex;
            gap: 0.75rem;
            justify-content: flex-end;
          }

          .cancel-button,
          .save-button {
            padding: 0.5rem 1.25rem;
            border: none;
            border-radius: 6px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          }

          .cancel-button {
            background: var(--bg-secondary);
            color: var(--text-primary);
          }

          .cancel-button:hover {
            background: var(--bg-hover);
          }

          .save-button {
            background: var(--primary-color);
            color: white;
          }

          .save-button:hover {
            opacity: 0.9;
          }
        `}</style>
      </div>
    </div>
  )
}