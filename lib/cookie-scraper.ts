// Cookieベースのスクレイピング実装
import type { RankingItem } from '@/types/ranking'
import { fetchFromRSSFallback, decodeHTMLEntities } from './rss-fallback'

interface CookieConfig {
  nicosid?: string
  user_session?: string
  sensitive_material_status?: string
}

// 環境変数からCookie情報を取得
const getCookieConfig = (): CookieConfig => {
  return {
    nicosid: process.env.NICO_SESSION_ID || '1725186023.265332462',
    user_session: process.env.NICO_USER_SESSION || 'user_session_134077750_2da2315c5d1f49d1246ce0a83cc9519e18ab79a9bab91f27463f5dca8d10641a',
    sensitive_material_status: 'accept'
  }
}

// Cookieベースでランキングを取得
export async function cookieScrapeRanking(
  genre: string,
  term: '24h' | 'hour'
): Promise<{
  items: Partial<RankingItem>[]
  success: boolean
}> {
  const cookieConfig = getCookieConfig()
  
  // Cookie文字列を構築
  const cookieString = Object.entries(cookieConfig)
    .filter(([_, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ')
  
  const url = `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}`
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
        'Cookie': cookieString,
        'Referer': 'https://www.nicovideo.jp/'
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const html = await response.text()
    
    // ログイン状態を確認
    const isLoggedIn = html.includes('ログアウト') || html.includes('マイページ')
    if (!isLoggedIn && cookieConfig.nicosid) {
      console.warn('Cookie authentication may have failed')
    }
    
    // 動画データを抽出
    const items: Partial<RankingItem>[] = []
    
    // 動画IDが見つからない場合はRSSにフォールバック
    if (!html.includes('data-video-id')) {
      console.log('No video IDs found in HTML, trying RSS fallback')
      return await fetchFromRSSFallback(genre, term)
    }
    
    const videoPattern = /data-video-id="((?:sm|nm|so)\d+)"[\s\S]*?(?=data-video-id=|$)/g
    let match
    let rank = 1
    
    while ((match = videoPattern.exec(html)) !== null) {
      const videoId = match[1]
      const block = match[0]
      
      // タイトルを抽出
      const titleMatch = block.match(/(?:title|data-title)="([^"]+)"/);
      const title = titleMatch?.[1] || ''
      
      // サムネイルを抽出
      const thumbMatch = block.match(/(?:src|data-src|data-original)="(https?:\/\/[^"]+\.jpg[^"]*)"/);
      const thumbURL = thumbMatch?.[1]
      
      // 再生数を抽出
      const viewMatch = block.match(/>([\d,]+)\s*(?:再生|回視聴)</);
      const views = viewMatch?.[1] ? parseInt(viewMatch[1].replace(/,/g, ''), 10) : 0
      
      items.push({
        rank,
        id: videoId,
        title: decodeHTMLEntities(title),
        thumbURL,
        views
      })
      
      rank++
    }
    
    return {
      items,
      success: true
    }
    
  } catch (error) {
    console.error('Cookie scraping failed:', error)
    return {
      items: [],
      success: false
    }
  }
}


// 例のソレジャンル専用のスクレイパー
export async function scrapeReiSoreRanking(): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  // まずCookieベースでアクセス
  const cookieResult = await cookieScrapeRanking('d2um7mc4', '24h')
  
  if (cookieResult.success && cookieResult.items.length > 0) {
    return {
      items: cookieResult.items,
      popularTags: ['例のソレ', 'その他'] // デフォルトタグ
    }
  }
  
  // Cookieが失敗した場合は空を返す
  return {
    items: [],
    popularTags: ['例のソレ', 'その他']
  }
}