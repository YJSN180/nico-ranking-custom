'use client'

import { useEffect, useState } from 'react'
import { 
  isIOS, 
  isIOSSafari, 
  isAndroid,
  isPWAInstalled,
  shouldShowInstallPrompt,
  markInstallPromptShown,
  markInstallPromptDismissed
} from '@/lib/pwa/detection'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop' | null>(null)

  useEffect(() => {
    // 既にPWAとしてインストール済みの場合は何も表示しない
    if (isPWAInstalled()) {
      return
    }

    // プラットフォームを判定
    if (isIOS()) {
      setPlatform('ios')
    } else if (isAndroid()) {
      setPlatform('android')
    } else {
      setPlatform('desktop')
    }

    // インストールプロンプトを表示すべきか判定
    if (!shouldShowInstallPrompt()) {
      return
    }

    // iOS Safari の場合は手動インストール案内を表示
    if (isIOSSafari()) {
      // 少し遅延させて表示（ページ読み込み完了後）
      const timer = setTimeout(() => {
        setShowPrompt(true)
        markInstallPromptShown()
      }, 3000)

      return () => clearTimeout(timer)
    }

    // Android/Desktop: beforeinstallpromptイベントを待つ
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      
      // プロンプトを表示
      setTimeout(() => {
        setShowPrompt(true)
        markInstallPromptShown()
      }, 3000)
    }

    // カスタムイベントでプロンプトを表示（Safari警告から）
    const handleShowPrompt = () => {
      setShowPrompt(true)
      markInstallPromptShown()
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('show-pwa-install-prompt', handleShowPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('show-pwa-install-prompt', handleShowPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Android/Desktop: ネイティブインストールダイアログを表示
      try {
        await deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        
        if (outcome === 'accepted') {
          // PWA installation accepted
        } else {
          markInstallPromptDismissed()
        }
      } catch (error) {
        console.error('Failed to show install prompt:', error)
      }
      
      setDeferredPrompt(null)
      setShowPrompt(false)
    }
  }

  const handleDismiss = () => {
    markInstallPromptDismissed()
    setShowPrompt(false)
  }

  if (!showPrompt) {
    return null
  }

  return (
    <div className="pwa-install-prompt" data-testid="pwa-install-prompt">
      <div className="prompt-content">
        <div className="prompt-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
        </div>
        
        <div className="prompt-text">
          <h4>アプリとしてインストール</h4>
          {platform === 'ios' ? (
            <p>
              ニコランをホーム画面に追加して、アプリのように使えます。
              オフラインでもマイリストを確認できます。
            </p>
          ) : (
            <p>
              ニコランをインストールして、より快適にご利用いただけます。
              オフラインでもマイリストを確認できます。
            </p>
          )}
        </div>

        <button 
          className="dismiss-button"
          onClick={handleDismiss}
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>

      {platform === 'ios' ? (
        <IOSInstallInstructions onClose={handleDismiss} />
      ) : (
        <div className="prompt-actions">
          <button 
            className="install-button"
            onClick={handleInstallClick}
          >
            インストール
          </button>
          <button 
            className="later-button"
            onClick={handleDismiss}
          >
            後で
          </button>
        </div>
      )}

      <style jsx>{`
        .pwa-install-prompt {
          position: fixed;
          bottom: 20px;
          left: 20px;
          right: 20px;
          max-width: 420px;
          margin: 0 auto;
          background: var(--surface-color);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          padding: 16px;
          z-index: 1000;
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .prompt-content {
          display: flex;
          gap: 12px;
          align-items: start;
          margin-bottom: 16px;
        }

        .prompt-icon {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          color: var(--primary-color);
        }

        .prompt-text {
          flex: 1;
        }

        .prompt-text h4 {
          margin: 0 0 4px;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .prompt-text p {
          margin: 0;
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .dismiss-button {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 24px;
          height: 24px;
          border: none;
          background: none;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background-color 0.2s;
        }

        .dismiss-button:hover {
          background-color: var(--surface-hover);
        }

        .prompt-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .install-button,
        .later-button {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .install-button {
          background: var(--primary-color);
          color: white;
        }

        .install-button:hover {
          background: var(--primary-hover);
        }

        .later-button {
          background: var(--surface-secondary);
          color: var(--text-secondary);
        }

        .later-button:hover {
          background: var(--surface-hover);
        }

        @media (max-width: 480px) {
          .pwa-install-prompt {
            left: 10px;
            right: 10px;
            bottom: 10px;
          }
        }
      `}</style>
    </div>
  )
}

// iOS向けインストール手順
function IOSInstallInstructions({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1)

  return (
    <div className="ios-instructions">
      <div className="step-indicator">
        <span className={step >= 1 ? 'active' : ''}>1</span>
        <span className={step >= 2 ? 'active' : ''}>2</span>
        <span className={step >= 3 ? 'active' : ''}>3</span>
      </div>

      <div className="step-content">
        {step === 1 && (
          <>
            <div className="step-image">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.632 4.684C18.114 15.938 18 15.482 18 15c0-.482.114-.938.316-1.342m0 2.684a3 3 0 110-2.684M5.25 7.5A2.25 2.25 0 013 5.25v-1.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 3.75v1.5a2.25 2.25 0 01-2.25 2.25H5.25z" />
              </svg>
            </div>
            <p>画面下部の共有ボタンをタップ</p>
          </>
        )}
        {step === 2 && (
          <>
            <div className="step-image">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p>「ホーム画面に追加」を選択</p>
          </>
        )}
        {step === 3 && (
          <>
            <div className="step-image">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p>「追加」をタップして完了！</p>
          </>
        )}
      </div>

      <div className="step-actions">
        {step > 1 && (
          <button onClick={() => setStep(step - 1)} className="prev-button">
            戻る
          </button>
        )}
        {step < 3 ? (
          <button onClick={() => setStep(step + 1)} className="next-button">
            次へ
          </button>
        ) : (
          <button onClick={onClose} className="done-button">
            完了
          </button>
        )}
      </div>

      <style jsx>{`
        .ios-instructions {
          padding-top: 16px;
          border-top: 1px solid var(--border-color);
        }

        .step-indicator {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-bottom: 16px;
        }

        .step-indicator span {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--surface-secondary);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .step-indicator span.active {
          background: var(--primary-color);
          color: white;
        }

        .step-content {
          text-align: center;
          margin-bottom: 16px;
        }

        .step-image {
          width: 48px;
          height: 48px;
          margin: 0 auto 12px;
          color: var(--primary-color);
        }

        .step-content p {
          margin: 0;
          font-size: 14px;
          color: var(--text-primary);
        }

        .step-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .prev-button,
        .next-button,
        .done-button {
          padding: 8px 20px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .prev-button {
          background: var(--surface-secondary);
          color: var(--text-secondary);
        }

        .next-button,
        .done-button {
          background: var(--primary-color);
          color: white;
        }

        .prev-button:hover {
          background: var(--surface-hover);
        }

        .next-button:hover,
        .done-button:hover {
          background: var(--primary-hover);
        }
      `}</style>
    </div>
  )
}