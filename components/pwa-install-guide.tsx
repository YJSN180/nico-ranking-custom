'use client'

import { useState, useEffect } from 'react'
import { isPWAInstalled, isIOS, isAndroid } from '@/lib/pwa/detection'

export function PWAInstallGuide() {
  const [isInstalled, setIsInstalled] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop')

  useEffect(() => {
    // PWAとしてインストール済みの場合は表示しない
    const installed = isPWAInstalled()
    setIsInstalled(installed)
    setShowGuide(!installed)
    
    // プラットフォームを判定
    if (isIOS()) {
      setPlatform('ios')
    } else if (isAndroid()) {
      setPlatform('android')
    } else {
      setPlatform('desktop')
    }
  }, [])

  if (!showGuide) {
    return null
  }

  return (
    <div className="install-guide" data-testid="pwa-install-guide">
      <div className="guide-content">
        <h4>
          <span className="icon">📱</span>
          アプリとしてインストール
        </h4>
        <p className="description">
          ホーム画面に追加すると、アプリのように快適に利用できます。
          一度読み込んだデータはキャッシュされ、より高速に表示されます。
        </p>
        
        <div className="install-steps">
          <h5>インストール方法：</h5>
          {platform === 'ios' ? (
            <ol>
              <li>
                <span className="step-icon">1️⃣</span>
                Safari下部の共有ボタン
                <span className="share-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.632 4.684C18.114 15.938 18 15.482 18 15c0-.482.114-.938.316-1.342m0 2.684a3 3 0 110-2.684M5.25 7.5A2.25 2.25 0 013 5.25v-1.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 3.75v1.5a2.25 2.25 0 01-2.25 2.25H5.25z" />
                  </svg>
                </span>
                をタップ
              </li>
              <li>
                <span className="step-icon">2️⃣</span>
                「ホーム画面に追加」を選択
              </li>
              <li>
                <span className="step-icon">3️⃣</span>
                右上の「追加」をタップ
              </li>
            </ol>
          ) : platform === 'android' ? (
            <ol>
              <li>
                <span className="step-icon">1️⃣</span>
                Chrome右上のメニュー（︙）をタップ
              </li>
              <li>
                <span className="step-icon">2️⃣</span>
                「ホーム画面に追加」を選択
              </li>
              <li>
                <span className="step-icon">3️⃣</span>
                「追加」をタップして完了
              </li>
            </ol>
          ) : (
            <ol>
              <li>
                <span className="step-icon">1️⃣</span>
                ブラウザのアドレスバー右端のインストールアイコンをクリック
              </li>
              <li>
                <span className="step-icon">2️⃣</span>
                「インストール」をクリック
              </li>
              <li>
                <span className="step-icon">3️⃣</span>
                インストール完了後、アプリとして起動可能
              </li>
            </ol>
          )}
          {platform === 'ios' && (
            <p className="notice">
              ※ iOS/iPadOSではSafariブラウザからのみインストール可能です
            </p>
          )}
        </div>

        <div className="benefits">
          <h5>メリット：</h5>
          <ul>
            <li>✅ キャッシュによる高速表示</li>
            <li>✅ アプリのような快適な操作性</li>
            <li>✅ ホーム画面から素早くアクセス</li>
          </ul>
        </div>
      </div>

      <style jsx>{`
        .install-guide {
          background: var(--surface-color);
          border: 1px solid var(--primary-color);
          border-radius: 12px;
          padding: 1.5rem;
          margin: 1rem 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .guide-content h4 {
          margin: 0 0 0.75rem;
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .icon {
          font-size: 1.2rem;
        }

        .description {
          margin: 0 0 1.5rem;
          font-size: 0.9rem;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .install-steps,
        .benefits {
          margin-bottom: 1.5rem;
        }

        .install-steps:last-child,
        .benefits:last-child {
          margin-bottom: 0;
        }

        .install-steps h5,
        .benefits h5 {
          margin: 0 0 0.75rem;
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .install-steps ol {
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .install-steps li {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0;
          font-size: 0.9rem;
          color: var(--text-primary);
          line-height: 1.5;
        }

        .step-icon {
          flex-shrink: 0;
          font-size: 1rem;
        }

        .share-icon {
          display: inline-flex;
          align-items: center;
          margin: 0 0.25rem;
          color: var(--primary-color);
        }

        .benefits ul {
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .benefits li {
          padding: 0.4rem 0;
          font-size: 0.9rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .notice {
          margin: 0.75rem 0 0;
          padding: 0.5rem 0.75rem;
          background: rgba(var(--warning-rgb, 251, 191, 36), 0.1);
          border-left: 3px solid var(--warning-color, #fbbf24);
          font-size: 0.85rem;
          color: var(--text-secondary);
          border-radius: 4px;
        }

        @media (max-width: 768px) {
          .install-guide {
            padding: 1.25rem;
            margin: 0.75rem 0;
          }

          .guide-content h4 {
            font-size: 1rem;
          }

          .description,
          .install-steps li,
          .benefits li {
            font-size: 0.85rem;
          }

          .install-steps h5,
          .benefits h5 {
            font-size: 0.9rem;
          }
        }

        /* ダークモード対応 */
        @media (prefers-color-scheme: dark) {
          .install-guide {
            background: var(--surface-color);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          }
        }
      `}</style>
    </div>
  )
}