'use client'

import { useState, useEffect } from 'react'
// Note: This component is deprecated in favor of browser-recommendation-ssr.tsx
import './browser-recommendation.css'

export function BrowserRecommendation() {
  const [showRecommendation, setShowRecommendation] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    // ローカルストレージから既読状態を確認
    const dismissed = localStorage.getItem('browser-recommendation-dismissed')
    if (dismissed === 'true') {
      setIsDismissed(true)
      return
    }

    // ユーザーエージェントを確認
    const ua = navigator.userAgent.toLowerCase()
    const isIPad = ua.includes('ipad') || (ua.includes('macintosh') && 'ontouchend' in document)
    const isIPhone = ua.includes('iphone') && !isIPad
    const isSafari = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('crios')
    const isSamsungBrowser = ua.includes('samsungbrowser')
    const isLowEndAndroid = ua.includes('android') && (
      ua.includes('sm-a') || // Samsung A series
      ua.includes('redmi') || // Xiaomi Redmi
      ua.includes('oppo') ||
      ua.includes('vivo')
    )

    // 問題のある環境の場合のみ表示
    if ((isIPad || isIPhone || isLowEndAndroid) && isSafari || isSamsungBrowser) {
      setShowRecommendation(true)
    }
  }, [])

  const handleDismiss = () => {
    setShowRecommendation(false)
    setIsDismissed(true)
    localStorage.setItem('browser-recommendation-dismissed', 'true')
  }

  if (!showRecommendation || isDismissed) {
    return null
  }

  return (
    <div className="browser-recommendation" role="alert" aria-live="polite">
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
            お使いのブラウザでは表示が遅くなる場合があります。
            <strong>Google Chrome</strong>での閲覧を推奨します。
          </p>
          
          <div className="browser-recommendation-links">
            {/* iPadの場合 */}
            {navigator.userAgent.includes('iPad') && (
              <a
                href="https://apps.apple.com/jp/app/google-chrome/id535886823"
                target="_blank"
                rel="noopener noreferrer"
                className="browser-recommendation-button"
              >
                Chrome for iPadをダウンロード
              </a>
            )}
            
            {/* iPhoneの場合 */}
            {navigator.userAgent.includes('iPhone') && (
              <a
                href="https://apps.apple.com/jp/app/google-chrome/id535886823"
                target="_blank"
                rel="noopener noreferrer"
                className="browser-recommendation-button"
              >
                Chrome for iPhoneをダウンロード
              </a>
            )}
            
            {/* Androidの場合 */}
            {navigator.userAgent.includes('Android') && (
              <a
                href="https://play.google.com/store/apps/details?id=com.android.chrome"
                target="_blank"
                rel="noopener noreferrer"
                className="browser-recommendation-button"
              >
                Chrome for Androidをダウンロード
              </a>
            )}
          </div>
          
          <p className="browser-recommendation-note">
            ※ 既にChromeをお使いの場合は、このメッセージを閉じてください。
          </p>
        </div>
      </div>
    </div>
  )
}