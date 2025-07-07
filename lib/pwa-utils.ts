/**
 * PWA関連のユーティリティ関数
 */

/**
 * 現在の環境がPWA（standalone/fullscreen）として動作しているかを検出
 * @returns PWAとして動作している場合はtrue
 */
export function isPWA(): boolean {
  // display-mode: standalone（通常のPWA）
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true
  }
  
  // display-mode: fullscreen（フルスクリーンPWA）
  if (window.matchMedia('(display-mode: fullscreen)').matches) {
    return true
  }
  
  // iOS Safari の standalone モード（レガシー）
  if ('standalone' in window.navigator && (window.navigator as any).standalone) {
    return true
  }
  
  // display-mode: minimal-ui（一部のブラウザ）
  if (window.matchMedia('(display-mode: minimal-ui)').matches) {
    return true
  }
  
  return false
}

/**
 * PWA環境に応じたtarget属性を返す
 * @returns PWAの場合は'_self'、通常ブラウザの場合は'_blank'
 */
export function getLinkTarget(): '_self' | '_blank' {
  return isPWA() ? '_self' : '_blank'
}

/**
 * PWA環境に応じてリンクをナビゲート
 * @param url 遷移先URL
 * @param e クリックイベント（オプション）
 */
export function navigateToVideo(url: string, e?: React.MouseEvent): void {
  if (isPWA()) {
    // PWAの場合は同一タブで遷移
    if (e) {
      e.preventDefault()
    }
    window.location.href = url
  } else {
    // ブラウザの場合は新規タブで開く
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}