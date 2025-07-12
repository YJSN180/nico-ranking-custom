/**
 * PWA関連のユーティリティ関数
 */

/**
 * 現在の環境がPWA（standalone/fullscreen）として動作しているかを検出
 * @returns PWAとして動作している場合はtrue
 */
export function isPWA(): boolean {
  // Check if window is available (for SSR)
  if (typeof window === 'undefined') {
    return false
  }
  
  // Early return for test environment unless specifically testing PWA
  if (process.env.NODE_ENV === 'test' && !(window as any).__TESTING_PWA__) {
    return false
  }
  
  // Check if matchMedia is available
  if (!window.matchMedia || typeof window.matchMedia !== 'function') {
    return false
  }
  
  try {
    // Double-check matchMedia is still available (for test environments)
    const matchMedia = window.matchMedia
    if (!matchMedia || typeof matchMedia !== 'function') {
      return false
    }
    
    // display-mode: standalone（通常のPWA）
    const standaloneQuery = matchMedia('(display-mode: standalone)')
    if (standaloneQuery && standaloneQuery.matches) {
      return true
    }
    
    // display-mode: fullscreen（フルスクリーンPWA）
    const fullscreenQuery = matchMedia('(display-mode: fullscreen)')
    if (fullscreenQuery && fullscreenQuery.matches) {
      return true
    }
    
    // display-mode: minimal-ui（一部のブラウザ）
    const minimalUIQuery = matchMedia('(display-mode: minimal-ui)')
    if (minimalUIQuery && minimalUIQuery.matches) {
      return true
    }
  } catch (error) {
    // matchMedia might throw in some test environments
    return false
  }
  
  // iOS Safari の standalone モード（レガシー）
  try {
    if ('standalone' in window.navigator && (window.navigator as any).standalone) {
      return true
    }
  } catch (error) {
    // Ignore navigation errors
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