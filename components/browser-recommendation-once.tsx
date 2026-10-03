'use client'

import { useState, useSyncExternalStore } from 'react'
import './browser-recommendation.css'

const DISMISSED_KEY = 'browser-recommendation-dismissed'
const subscribeNoop = () => () => {}

export function BrowserRecommendationOnce() {
  // LocalStorageの読み込み（useEffectを使わずに実装）。SSR とハイドレーション中は
  // サーバーの値（null＝確認中）を使い、その後クライアントの値で描き直す。
  // useState の初期値で読むと SSR と class だけが食い違い、ハイドレーションで直らず
  // 確認中（非表示）のまま残る
  const storedDismissed = useSyncExternalStore<boolean | null>(
    subscribeNoop,
    () => localStorage.getItem(DISMISSED_KEY) === 'true',
    () => null
  )
  const [dismissedNow, setDismissedNow] = useState(false)
  const isDismissed = dismissedNow ? true : storedDismissed

  const handleDismiss = () => {
    setDismissedNow(true)
    localStorage.setItem(DISMISSED_KEY, 'true')
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