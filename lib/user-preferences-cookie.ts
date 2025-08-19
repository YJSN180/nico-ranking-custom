import type { UserPreferences } from '@/hooks/use-user-preferences'

export const COOKIE_NAME = 'user-preferences'
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1年

// クライアントサイドでCookieを取得
export function getUserPreferencesCookieClient(): Partial<UserPreferences> | null {
  if (typeof document === 'undefined') return null
  
  const cookies = document.cookie.split(';')
  const preferenceCookie = cookies.find(cookie => 
    cookie.trim().startsWith(`${COOKIE_NAME}=`)
  )
  
  if (!preferenceCookie) return null
  
  try {
    const value = preferenceCookie.split('=')[1]
    if (!value) return null
    return JSON.parse(decodeURIComponent(value))
  } catch {
    return null
  }
}

// クライアントサイドでCookieを設定
export function setUserPreferencesCookieClient(preferences: Partial<UserPreferences>) {
  if (typeof document === 'undefined') return
  
  const value = encodeURIComponent(JSON.stringify(preferences))
  const expires = new Date(Date.now() + COOKIE_MAX_AGE * 1000).toUTCString()
  
  // PWA環境での永続性を改善
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'
  // PWAではSameSite=Laxを使用して永続性を確保
  // Vercelプレビュー環境（異なるドメイン）ではSameSite=Noneを使用
  const isVercelPreview = typeof window !== 'undefined' && 
    (window.location.hostname.includes('vercel.app') || 
     window.location.hostname.includes('vercel-'))
  
  let cookieString = `${COOKIE_NAME}=${value}; expires=${expires}; path=/`
  
  if (isVercelPreview && isSecure) {
    // Vercelプレビュー環境では SameSite=None; Secure が必要
    cookieString += '; SameSite=None; Secure'
  } else if (isSecure) {
    // 本番HTTPS環境では SameSite=Lax; Secure で永続性を確保
    cookieString += '; SameSite=Lax; Secure'
  } else {
    // HTTP環境では SameSite=Lax のみ
    cookieString += '; SameSite=Lax'
  }
  
  document.cookie = cookieString
  
  // デバッグログ（開発環境のみ）
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log('[Cookie] Setting with:', {
      isSecure,
      isVercelPreview,
      cookieString: cookieString.substring(0, 100) + '...'
    })
  }
}