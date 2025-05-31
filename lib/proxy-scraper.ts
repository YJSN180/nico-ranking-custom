// プロキシサーバー経由で例のソレジャンルのランキングを取得

import type { RankingItem } from '@/types/ranking'

export interface ProxyConfig {
  url?: string
  host?: string
  port?: number
  auth?: {
    username: string
    password: string
  }
}

export async function fetchRankingViaProxy(
  genreId: string,
  term: 'hour' | '24h' = 'hour',
  proxyConfig?: ProxyConfig
) {
  const targetUrl = `https://www.nicovideo.jp/ranking/genre/${genreId}?term=${term}`
  
  // プロキシ経由でフェッチ（Node.js環境）
  if (proxyConfig && typeof window === 'undefined') {
    const { HttpsProxyAgent } = await import('https-proxy-agent')
    const proxyUrl = proxyConfig.url || `http://${proxyConfig.host}:${proxyConfig.port}`
    const agent = new HttpsProxyAgent(proxyUrl)
    
    const response = await fetch(targetUrl, {
      // @ts-ignore
      agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
        'Cookie': 'sensitive_material_status=accept'
      }
    })
    
    return parseRankingResponse(await response.text(), genreId)
  }
  
  // プロキシなしの通常フェッチ
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja',
      'Cookie': 'sensitive_material_status=accept'
    }
  })
  
  return parseRankingResponse(await response.text(), genreId)
}

// HTMLからserver-responseメタタグをパースしてランキングデータを抽出
function parseRankingResponse(html: string, expectedGenreId: string) {
  // server-responseメタタグを探す
  const serverResponseMatch = html.match(/name="server-response"\s+content="([^"]+)"/)
  
  if (!serverResponseMatch) {
    throw new Error('server-responseメタタグが見つかりません')
  }
  
  // HTMLエンティティをデコード
  const decodedContent = serverResponseMatch[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
  
  const serverData = JSON.parse(decodedContent)
  const rankingData = serverData.data?.response?.$getTeibanRanking?.data
  
  if (!rankingData) {
    throw new Error('ランキングデータが見つかりません')
  }
  
  // 期待したジャンルか確認
  if (rankingData.featuredKey !== expectedGenreId) {
    console.warn(`警告: 期待したジャンル(${expectedGenreId})と異なるジャンル(${rankingData.featuredKey})のデータが返されました`)
  }
  
  return {
    genre: rankingData.label,
    genreId: rankingData.featuredKey,
    items: rankingData.items?.map((item: any) => ({
      rank: rankingData.items.indexOf(item) + 1,
      id: item.id,
      title: item.title,
      thumbnail: item.thumbnail?.url || item.thumbnail?.middleUrl,
      views: item.count?.view || 0,
      comments: item.count?.comment || 0,
      mylists: item.count?.mylist || 0,
      likes: item.count?.like || 0,
      duration: item.duration,
      registeredAt: item.registeredAt,
      owner: item.owner
    })) || []
  }
}

// 日本のプロキシサーバーリスト（例）
export const japaneseProxies: ProxyConfig[] = [
  // 無料プロキシ（信頼性は低い）
  { host: 'jp.proxy.com', port: 8080 },
  { host: 'tokyo.proxy.net', port: 3128 },
  
  // 有料プロキシサービス（要契約）
  // { url: 'http://username:password@jp-proxy.service.com:8080' }
]

// プロキシ設定が有効かチェック
export function isProxyConfigured(): boolean {
  // 環境変数でプロキシ設定を確認
  return !!(process.env.PROXY_URL || process.env.PROXY_HOST)
}

// プロキシ設定を取得
function getProxyConfig(): ProxyConfig | undefined {
  if (process.env.PROXY_URL) {
    return { url: process.env.PROXY_URL }
  } else if (process.env.PROXY_HOST && process.env.PROXY_PORT) {
    return {
      host: process.env.PROXY_HOST,
      port: parseInt(process.env.PROXY_PORT, 10)
    }
  }
  return undefined
}

// プロキシ経由でランキングを取得（complete-hybrid-scraper用）
export async function scrapeRankingViaProxy(
  genre: string,
  term: '24h' | 'hour',
  tag?: string
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  const proxyConfig = getProxyConfig()
  
  if (!proxyConfig) {
    throw new Error('プロキシが設定されていません')
  }
  
  // タグ付きランキングのURL構築
  let targetUrl = `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}`
  if (tag) {
    targetUrl += `&tag=${encodeURIComponent(tag)}`
  }
  
  const result = await fetchRankingViaProxy(genre, term, proxyConfig)
  
  return {
    items: result.items,
    popularTags: [] // プロキシ経由では人気タグは取得しない
  }
}

// テスト用関数
export async function testProxyAccess() {
  console.log('=== プロキシ経由で例のソレジャンルアクセステスト ===')
  
  // プロキシなしでテスト
  console.log('\n1. プロキシなしでアクセス')
  try {
    const result = await fetchRankingViaProxy('d2um7mc4', 'hour')
    console.log(`結果: ${result.genre} (${result.genreId})`)
    console.log(`アイテム数: ${result.items.length}`)
  } catch (error) {
    console.error('エラー:', error)
  }
  
  // 各プロキシでテスト
  for (const proxy of japaneseProxies) {
    console.log(`\n2. プロキシ経由: ${proxy.host}:${proxy.port}`)
    try {
      const result = await fetchRankingViaProxy('d2um7mc4', 'hour', proxy)
      console.log(`結果: ${result.genre} (${result.genreId})`)
      console.log(`アイテム数: ${result.items.length}`)
      
      if (result.genreId === 'd2um7mc4') {
        console.log('🎯 例のソレジャンルのデータ取得成功！')
        return result
      }
    } catch (error) {
      console.error('エラー:', error)
    }
  }
}