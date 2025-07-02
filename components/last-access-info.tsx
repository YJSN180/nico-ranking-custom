'use client'

import { useEffect, useState } from 'react'
import { getLastAccessTime, getDaysSinceLastAccess, saveLastAccessTime } from '@/lib/storage/persistence'

export function LastAccessInfo() {
  const [lastAccess, setLastAccess] = useState<Date | null>(null)
  const [daysSince, setDaysSince] = useState<number | null>(null)

  useEffect(() => {
    // 最終アクセス時刻を更新
    saveLastAccessTime()
    
    // 表示用の最終アクセス時刻を取得
    const updateAccessInfo = () => {
      const accessTime = getLastAccessTime()
      const days = getDaysSinceLastAccess()
      
      setLastAccess(accessTime)
      setDaysSince(days)
    }
    
    updateAccessInfo()
    
    // 1分ごとに更新
    const interval = setInterval(updateAccessInfo, 60000)
    
    return () => clearInterval(interval)
  }, [])

  if (!lastAccess) {
    return null
  }

  const formatDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    
    return `${year}/${month}/${day} ${hours}:${minutes}`
  }

  const getWarningClass = () => {
    if (daysSince === null) return ''
    if (daysSince >= 6) return 'warning-critical'
    if (daysSince >= 4) return 'warning-high'
    return ''
  }

  return (
    <div className={`last-access-info ${getWarningClass()}`} data-testid="last-access-info">
      <div className="access-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className="access-text">
        <span className="access-label">最終アクセス:</span>
        <span className="access-time" data-testid="last-access-timestamp">
          {formatDate(lastAccess)}
        </span>
        {daysSince !== null && daysSince > 0 && (
          <span className="days-since">
            （{daysSince}日前）
          </span>
        )}
      </div>
      <style jsx>{`
        .last-access-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-size: 0.875rem;
          transition: all 0.3s;
        }

        .last-access-info.warning-high {
          background: rgba(251, 191, 36, 0.1);
          border-color: rgba(251, 191, 36, 0.3);
        }

        .last-access-info.warning-critical {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.3);
        }

        .access-icon {
          width: 16px;
          height: 16px;
          color: var(--text-secondary);
          flex-shrink: 0;
        }

        .warning-high .access-icon {
          color: rgb(251, 191, 36);
        }

        .warning-critical .access-icon {
          color: rgb(239, 68, 68);
        }

        .access-text {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .access-label {
          color: var(--text-secondary);
        }

        .access-time {
          color: var(--text-primary);
          font-weight: 500;
        }

        .days-since {
          color: var(--text-secondary);
          font-size: 0.8125rem;
        }

        .warning-high .days-since {
          color: rgb(251, 191, 36);
          font-weight: 500;
        }

        .warning-critical .days-since {
          color: rgb(239, 68, 68);
          font-weight: 500;
        }

        @media (max-width: 768px) {
          .last-access-info {
            font-size: 0.8125rem;
            padding: 0.375rem 0.75rem;
          }

          .access-text {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
          }
        }
      `}</style>
    </div>
  )
}