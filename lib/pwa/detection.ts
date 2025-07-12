/**
 * PWAインストール状態とプラットフォーム検出
 */

/**
 * iOSデバイスかどうかを判定
 */
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false
  
  const ua = window.navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/.test(ua) && !/android/.test(ua)
}

/**
 * iOS Safariかどうかを判定
 */
export function isIOSSafari(): boolean {
  if (!isIOS()) return false
  
  const ua = window.navigator.userAgent.toLowerCase()
  // CriOSはChrome for iOS、FxiOSはFirefox for iOS
  return /webkit/.test(ua) && !/crios|fxios/.test(ua)
}

/**
 * Androidデバイスかどうかを判定
 */
export function isAndroid(): boolean {
  if (typeof window === 'undefined') return false
  
  const ua = window.navigator.userAgent.toLowerCase()
  return /android/.test(ua)
}

/**
 * PWAとしてインストール済みかどうかを判定
 * display-mode: standaloneまたはfullscreenで実行されている場合はインストール済み
 */
export function isPWAInstalled(): boolean {
  if (typeof window === 'undefined') return false
  
  // Early return for test environment unless specifically testing PWA
  if (process.env.NODE_ENV === 'test' && !(window as any).__TESTING_PWA_DETECTION__) {
    return false
  }
  
  // メディアクエリでdisplay-modeをチェック
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  const isFullscreen = window.matchMedia('(display-mode: fullscreen)').matches
  
  // iOS特有のstandalone検出
  // @ts-ignore
  const isIOSStandalone = window.navigator.standalone === true
  
  return isStandalone || isFullscreen || isIOSStandalone
}

/**
 * モバイルデバイスかどうかを判定
 */
export function isMobile(): boolean {
  if (typeof window === 'undefined') return false
  
  // タッチデバイスかつ画面幅が768px以下
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const isSmallScreen = window.innerWidth <= 768
  
  return hasTouch && isSmallScreen
}

/**
 * PWAインストール可能な環境かどうかを判定
 */
export function canInstallPWA(): boolean {
  // 既にインストール済みの場合はfalse
  if (isPWAInstalled()) return false
  
  // モバイルの場合
  if (isMobile()) {
    // iOS Safariの場合は常にインストール可能（手動）
    if (isIOSSafari()) return true
    
    // Androidの場合はChromeまたはEdgeなら可能
    if (isAndroid()) {
      const ua = window.navigator.userAgent.toLowerCase()
      return /chrome|edg/.test(ua)
    }
  }
  
  // デスクトップの場合はChrome/Edge/Safariで可能
  const ua = window.navigator.userAgent.toLowerCase()
  return /chrome|edg|safari/.test(ua) && !/mobile/.test(ua)
}

/**
 * PWAインストールプロンプトを表示すべきかどうかを判定
 * LocalStorageを使用してユーザーの選択を記憶
 */
export function shouldShowInstallPrompt(): boolean {
  if (!canInstallPWA()) return false
  
  // ユーザーが既に拒否している場合
  const dismissedAt = localStorage.getItem('pwa_install_dismissed')
  if (dismissedAt) {
    const dismissedDate = new Date(dismissedAt)
    const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24)
    
    // 30日経過していない場合は表示しない
    if (daysSinceDismissed < 30) return false
  }
  
  // インストールプロンプトを表示した回数
  const promptCount = parseInt(localStorage.getItem('pwa_install_prompt_count') || '0', 10)
  
  // 3回以上表示している場合は表示しない
  if (promptCount >= 3) return false
  
  // 初回訪問から一定時間経過しているか
  const firstVisit = localStorage.getItem('first_visit')
  if (!firstVisit) {
    localStorage.setItem('first_visit', new Date().toISOString())
    return false // 初回訪問では表示しない
  }
  
  const firstVisitDate = new Date(firstVisit)
  const daysSinceFirstVisit = (Date.now() - firstVisitDate.getTime()) / (1000 * 60 * 60 * 24)
  
  // 初回訪問から2日以上経過している場合のみ表示
  return daysSinceFirstVisit >= 2
}

/**
 * PWAインストールプロンプトを表示したことを記録
 */
export function markInstallPromptShown(): void {
  const count = parseInt(localStorage.getItem('pwa_install_prompt_count') || '0', 10)
  localStorage.setItem('pwa_install_prompt_count', (count + 1).toString())
  localStorage.setItem('pwa_install_prompt_last_shown', new Date().toISOString())
}

/**
 * PWAインストールプロンプトを拒否したことを記録
 */
export function markInstallPromptDismissed(): void {
  localStorage.setItem('pwa_install_dismissed', new Date().toISOString())
}

/**
 * PWAインストールプロンプトの設定をリセット（デバッグ用）
 */
export function resetInstallPromptSettings(): void {
  localStorage.removeItem('pwa_install_dismissed')
  localStorage.removeItem('pwa_install_prompt_count')
  localStorage.removeItem('pwa_install_prompt_last_shown')
}