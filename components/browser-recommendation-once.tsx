'use client'

import { useState } from 'react'
import './browser-recommendation.css'

export function BrowserRecommendationOnce() {
  // LocalStorageの初期読み込み（useEffectを使わずに実装）
  const [isDismissed, setIsDismissed] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null // SSR時
    const dismissed = localStorage.getItem('browser-recommendation-dismissed')
    return dismissed === 'true'
  })

  const handleDismiss = () => {
    setIsDismissed(true)
    localStorage.setItem('browser-recommendation-dismissed', 'true')
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
          <h3>推奨ブラウザのお知らせ</h3>
          <p>
            特定のブラウザ（Safari/Samsung Browser）では表示が遅くなる場合があります。
            <strong>Brave/Vivaldi/Firefox/Google Chrome</strong>などでの閲覧を推奨します。
          </p>
          
          <div className="browser-recommendation-links">
          </div>
          
          <p className="browser-recommendation-note">
            ※ この通知は一度閉じると再度表示されません。
          </p>
        </div>
      </div>
    </div>
  )
}