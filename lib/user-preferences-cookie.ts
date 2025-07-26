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
  
  // Vercelプレビュー環境との互換性のため、SameSite=Noneに設定
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const sameSite = isSecure ? 'None' : 'Lax'
  
  document.cookie = `${COOKIE_NAME}=${value}; expires=${expires}; path=/; SameSite=${sameSite}${
    isSecure ? '; Secure' : ''
  }`
}