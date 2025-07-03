'use client'

import { useState, useEffect } from 'react'
import './browser-recommendation.css'

/**
 * ブラウザ推奨バナーコンポーネント
 * ヘッダー下に表示される警告バナー
 */
export function BrowserRecommendationBanner() {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    // 既に拒否されている場合は表示しない
    const dismissedCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith('browser-recommendation-dismissed='))
    
    if (dismissedCookie && dismissedCookie.split('=')[1] === 'true') {
      setIsVisible(false)
    }
  }, [])

  if (!isVisible) {
    return null
  }

  const handleDismiss = () => {
    setIsVisible(false)
    // ユーザーの選択を記録（24時間非表示）
    document.cookie = `browser-recommendation-dismissed=true; max-age=${60 * 60 * 24}; path=/`
  }

  const handleOpenChrome = () => {
    // Chrome/Edgeでの再アクセスを促すためのロジック
    window.open('https://www.google.com/chrome/', '_blank')
  }

  return (
    <div 
      className="browser-recommendation-banner"
      role="alert"
      aria-live="polite"
    >
      <div className="browser-recommendation-banner__content">
        <div className="browser-recommendation-banner__icon">
          ⚠️
        </div>
        <div className="browser-recommendation-banner__text">
          <h3 className="browser-recommendation-banner__title">
            ブラウザ推奨のお知らせ
          </h3>
          <p className="browser-recommendation-banner__message">
            現在のブラウザ（Safari/Samsung Browser）では、大量のデータ処理時にメモリ不足が発生する可能性があります。
            <strong>Chrome</strong>または<strong>Edge</strong>のご利用をお勧めします。
          </p>
        </div>
        <div className="browser-recommendation-banner__actions">
          <button 
            className="browser-recommendation-banner__button browser-recommendation-banner__button--primary"
            onClick={handleOpenChrome}
            type="button"
          >
            Chromeを開く
          </button>
          <button 
            className="browser-recommendation-banner__button browser-recommendation-banner__button--secondary"
            onClick={handleDismiss}
            type="button"
            aria-label="この通知を閉じる"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}