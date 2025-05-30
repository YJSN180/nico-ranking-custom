import { NextResponse } from 'next/server'
import type { RankingItem } from '@/types/ranking'

export const runtime = 'nodejs'

// テスト用のCookie設定
const COOKIE_CONFIGS = [
  {
    name: 'No Cookie',
    cookies: ''
  },
  {
    name: 'Sensitive Only',
    cookies: 'sensitive_material_status=accept'
  },
  {
    name: 'With Session (hardcoded)',
    cookies: 'nicosid=1725186023.265332462; user_session=user_session_134077750_2da2315c5d1f49d1246ce0a83cc9519e18ab79a9bab91f27463f5dca8d10641a; sensitive_material_status=accept'
  },
  {
    name: 'With Session (env)',
    cookies: process.env.NICO_COOKIES || 'sensitive_material_status=accept'
  }
]

async function testCookieAuth(cookieString: string) {
  const url = 'https://www.nicovideo.jp/ranking/genre/all?term=24h'
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja',
      'Cookie': cookieString,
      'Referer': 'https://www.nicovideo.jp/'
    }
  })
  
  if (!response.ok) {
    return { error: `HTTP ${response.status}` }
  }
  
  const html = await response.text()
  
  // センシティブ動画の存在をチェック
  const hasStaticElec = html.includes('静電気ドッキリ')
  const hasGundam = html.includes('Gundam G')
  
  // ログイン状態をチェック
  const isLoggedIn = html.includes('ログアウト') || html.includes('マイページ')
  
  // 動画IDを抽出
  const videoIds: string[] = []
  const dataIdPattern = /data-video-id="((?:sm|nm|so)\d+)"/g
  let match
  while ((match = dataIdPattern.exec(html)) !== null) {
    if (match[1] && !videoIds.includes(match[1])) {
      videoIds.push(match[1])
    }
  }
  
  // センシティブ動画のIDを特定
  let staticElecId = ''
  let gundamId = ''
  
  for (const id of videoIds) {
    const blockPattern = new RegExp(`data-video-id="${id}"[\\s\\S]*?(?=data-video-id=|$)`)
    const blockMatch = html.match(blockPattern)
    if (blockMatch && blockMatch[0]) {
      if (blockMatch[0].includes('静電気')) {
        staticElecId = id
      }
      if (blockMatch[0].includes('Gundam')) {
        gundamId = id
      }
    }
  }
  
  // meta tagの確認
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
  let metaSensitiveCount = 0
  
  if (metaMatch) {
    try {
      const encodedData = metaMatch[1]!
      const decodedData = encodedData.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      const jsonData = JSON.parse(decodedData)
      const items = jsonData?.data?.response?.$getTeibanRanking?.data?.items || []
      metaSensitiveCount = items.filter((item: any) => 
        item.title?.includes('静電気') || item.title?.includes('Gundam')
      ).length
    } catch (e) {
      // Parse error
    }
  }
  
  return {
    isLoggedIn,
    htmlLength: html.length,
    videoCount: videoIds.length,
    hasStaticElec,
    hasGundam,
    staticElecId: staticElecId || 'not found',
    gundamId: gundamId || 'not found',
    metaSensitiveCount
  }
}

export async function GET() {
  try {
    const results = []
    
    for (const config of COOKIE_CONFIGS) {
      const result = await testCookieAuth(config.cookies)
      results.push({
        config: config.name,
        ...result
      })
    }
    
    // 比較のため、completeHybridScrapeも実行
    const { completeHybridScrape } = await import('@/lib/complete-hybrid-scraper')
    const hybridResult = await completeHybridScrape('all', '24h')
    const hybridSensitive = hybridResult.items.filter(item => 
      item.title?.includes('静電気') || item.title?.includes('Gundam')
    )
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      environment: {
        hasEnvCookies: !!process.env.NICO_COOKIES,
        vercel: !!process.env.VERCEL
      },
      cookieTests: results,
      hybridScrape: {
        totalItems: hybridResult.items.length,
        sensitiveCount: hybridSensitive.length,
        sensitiveItems: hybridSensitive.map(item => ({
          title: item.title,
          id: item.id,
          rank: item.rank
        }))
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}