'use client'

import { useState, useEffect } from 'react'
import './browser-recommendation.css'

export function BrowserRecommendationOnce() {
  const [isDismissed, setIsDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    // localStorageから既読状態を確認
    const dismissed = localStorage.getItem('browser-recommendation-dismissed')
    setIsDismissed(dismissed === 'true')
  }, [])

  const handleDismiss = () => {
    setIsDismissed(true)
    localStorage.setItem('browser-recommendation-dismissed', 'true')
  }

  const handleChromeOpen = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // リンククリック時も非表示にする
    localStorage.setItem('browser-recommendation-dismissed', 'true')
    setIsDismissed(true)
    // デフォルトのリンク動作は続行（新しいタブで開く）
  }

  // SSR/CSRミスマッチを防ぐため、CSSで制御
  const className = isDismissed === null 
    ? 'browser-recommendation browser-recommendation--checking' 
    : isDismissed 
    ? 'browser-recommendation browser-recommendation--hidden' 
    : 'browser-recommendation'

  return (
    <div className={className} role="alert" aria-live="polite">
      <div className="browser-recommendation-content">
        <button
          onClick={handleDismiss}
          className="browser-recommendation-close"
          aria-label="閉じる"
        >
          ×
        </button>
        
        <div className="browser-recommendation-icon">
          ⚠️
        </div>
        
        <div className="browser-recommendation-text">
          <h3>パフォーマンス向上のお知らせ</h3>
          <p>
            特定のブラウザ（Safari/Samsung Browser）では表示が遅くなる場合があります。
            <strong>Google Chrome</strong>での閲覧を推奨します。
          </p>
          
          <div className="browser-recommendation-links">
            <a
              href="https://www.google.com/chrome/"
              target="_blank"
              rel="noopener noreferrer"
              className="browser-recommendation-button"
              onClick={handleChromeOpen}
            >
              Chromeを開く
            </a>
          </div>
          
          <p className="browser-recommendation-note">
            ※ この通知は一度閉じると再度表示されません。
          </p>
        </div>
      </div>
    </div>
  )
}