import { cookies } from 'next/headers'
import { BrowserRecommendationBanner } from './browser-recommendation-banner'

/**
 * SSR対応ブラウザ推奨コンポーネント
 * middlewareで設定されたCookieを読み取ってサーバーサイドで判定
 */
export async function BrowserRecommendationSSR() {
  const cookieStore = await cookies()
  const recommendationCookie = cookieStore.get('browser-recommendation')
  
  const shouldShow = recommendationCookie?.value === 'show'
  
  if (!shouldShow) {
    return null
  }
  
  return <BrowserRecommendationBanner />
}