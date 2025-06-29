'use client'

import { useEffect, useState } from 'react'
import { isSafari, requestPersistentStorage, checkPersistentStorage } from '@/lib/storage/persistence'
import { isIOSSafari, isPWAInstalled, isMobile } from '@/lib/pwa/detection'

export function SafariPersistenceWarning() {
  const [showWarning, setShowWarning] = useState(false)
  const [isPersisted, setIsPersisted] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isMobileSafari, setIsMobileSafari] = useState(false)

  useEffect(() => {
    const checkSafari = async () => {
      // PWAとしてインストール済みの場合は警告を表示しない
      const installed = isPWAInstalled()
      setIsInstalled(installed)
      
      if (installed) {
        setShowWarning(false)
        return
      }

      // Safariかどうかチェック
      if (isSafari()) {
        setShowWarning(true)
        setIsMobileSafari(isIOSSafari() && isMobile())
        const persisted = await checkPersistentStorage()
        setIsPersisted(persisted)
      }
    }
    checkSafari()
  }, [])

  const handleRequestPersistence = async () => {
    setRequesting(true)
    try {
      const result = await requestPersistentStorage()
      setIsPersisted(result.persisted)
      
      if (result.persisted) {
        alert('ストレージの永続化が許可されました')
      } else {
        alert('ストレージの永続化は許可されませんでした。定期的なバックアップを推奨します。')
      }
    } finally {
      setRequesting(false)
    }
  }

  if (!showWarning) {
    return null
  }

  return (
    <div className="safari-warning" data-testid="safari-persistence-warning">
      <div className="warning-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <div className="warning-content">
        <h4>Safariをご利用の方へ</h4>
        <p>
          Safariでは、7日間アクセスがないとマイリストデータが自動削除される場合があります。
          {isMobileSafari ? (
            <>アプリとしてインストールすることで、この制限を回避できます。</>
          ) : (
            <>大切なデータを守るため、定期的なバックアップをお勧めします。</>
          )}
        </p>
        <div className="warning-actions">
          {isMobileSafari ? (
            <button
              onClick={() => {
                // PWAインストールプロンプトを表示するイベントを発火
                window.dispatchEvent(new CustomEvent('show-pwa-install-prompt'))
              }}
              className="install-app-button"
              data-testid="install-app-button"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.632 4.684C18.114 15.938 18 15.482 18 15c0-.482.114-.938.316-1.342m0 2.684a3 3 0 110-2.684M5.25 7.5A2.25 2.25 0 013 5.25v-1.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 3.75v1.5a2.25 2.25 0 01-2.25 2.25H5.25z" />
              </svg>
              アプリとしてインストール
            </button>
          ) : (
            <>
              {!isPersisted && (
                <button
                  onClick={handleRequestPersistence}
                  disabled={requesting}
                  className="persistence-button"
                  data-testid="request-persistence-button"
                >
                  {requesting ? '確認中...' : 'データ永続化を要求'}
                </button>
              )}
              {isPersisted && (
                <div className="persistence-status" data-testid="persistence-result-message">
                  ✓ データ永続化が有効です
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <style jsx>{`
        .safari-warning {
          background: rgba(251, 191, 36, 0.1);
          border: 1px solid rgba(251, 191, 36, 0.3);
          border-radius: 12px;
          padding: 1rem;
          margin: 1rem 0;
          display: flex;
          gap: 1rem;
          align-items: start;
        }

        .warning-icon {
          flex-shrink: 0;
          width: 24px;
          height: 24px;
          color: rgb(251, 191, 36);
        }

        .warning-content {
          flex: 1;
        }

        .warning-content h4 {
          margin: 0 0 0.5rem;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .warning-content p {
          margin: 0 0 1rem;
          font-size: 0.875rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .warning-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .persistence-button {
          padding: 0.5rem 1rem;
          border: 1px solid rgba(251, 191, 36, 0.5);
          border-radius: 6px;
          background: rgba(251, 191, 36, 0.1);
          color: rgb(251, 191, 36);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .persistence-button:hover:not(:disabled) {
          background: rgba(251, 191, 36, 0.2);
          border-color: rgb(251, 191, 36);
        }

        .persistence-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .persistence-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: rgb(34, 197, 94);
          font-size: 0.875rem;
          font-weight: 500;
        }

        .install-app-button {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border: 1px solid var(--primary-color);
          border-radius: 6px;
          background: var(--primary-color);
          color: white;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .install-app-button:hover {
          background: var(--primary-hover);
          border-color: var(--primary-hover);
        }

        .install-app-button svg {
          flex-shrink: 0;
        }

        @media (max-width: 768px) {
          .safari-warning {
            flex-direction: column;
          }

          .warning-icon {
            width: 20px;
            height: 20px;
          }
        }
      `}</style>
    </div>
  )
}