#!/usr/bin/env node

import type { RankingItem } from '../types/ranking'
import type { RankingGenre } from '../types/ranking-config'

// fetchを動的に解決（テスト環境とランタイムの両方に対応）
const getFetch = () => {
  if (typeof globalThis.fetch !== 'undefined') {
    return globalThis.fetch
  }
  try {
    return require('node-fetch').default
  } catch {
    throw new Error('fetch is not available')
  }
}

interface ScrapedData {
  genre: RankingGenre
  items: RankingItem[]
  popularTags: string[]
  scrapedAt: string
  error?: string
}

// server-responseメタタグからデータを抽出
function extractServerResponseData(html: string): any {
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
  if (!metaMatch) {
    throw new Error('server-responseメタタグが見つかりません')
  }
  
  const encodedData = metaMatch[1]!
  const decodedData = encodedData
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
  
  return JSON.parse(decodedData)
}

// trendTagsから人気タグを抽出
function extractTrendTags(serverData: any): string[] {
  try {
    const trendTags = serverData.data?.response?.$getTeibanRankingFeaturedKeyAndTrendTags?.data?.trendTags
    
    if (!Array.isArray(trendTags)) {
      return []
    }
    
    return trendTags.filter((tag: any) => {
      return typeof tag === 'string' && tag.trim().length > 0
    })
  } catch (error) {
    return []
  }
}

// ジャンルIDマッピング
const GENRE_ID_MAP: Record<RankingGenre, string> = {
  all: 'all',
  entertainment: 'n8vfxdbi',
  radio: 'oxzi6bje',
  music: 'rr5ucexc',
  sing: 'f37eq4d3',
  play: 'hvcrnqpj',
  dance: 'z4h8e9mj',
  vocaloid: 'zc49b03a',
  nicoindies: 'o8s2vc0m',
  animal: 'ne72lua2',
  cooking: '9gkuqw8q',
  nature: 'l4wy3zaw',
  travel: 'h67gzba0',
  sports: '4w3p65pf',
  society: 'yspx0gpo',
  technology: 'x0nfxivd',
  handcraft: 'x3nkg5o7',
  commentary: 'mfg9v9pa',
  anime: '4eet3ca4',
  game: 'ojnwtgrg',
  other: 'ramuboyn',
  r18: 'r18',
  original: 'v5h6eeiw'
}

// 単一ジャンルのランキングデータを取得
export async function scrapeRankingData(
  genre: RankingGenre,
  term: '24h' | 'hour' = '24h'
): Promise<ScrapedData> {
  const genreId = GENRE_ID_MAP[genre] || genre
  const url = `https://www.nicovideo.jp/ranking/genre/${genreId}?term=${term}`
  
  try {
    console.log(`Scraping ${genre} (${genreId})...`)
    
    const fetch = getFetch()
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
        'Cookie': 'sensitive_material_status=accept'
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const html = await response.text()
    const serverData = extractServerResponseData(html)
    const rankingData = serverData.data?.response?.$getTeibanRanking?.data
    
    if (!rankingData) {
      throw new Error('ランキングデータが見つかりません')
    }
    
    // アイテムを整形
    const items: RankingItem[] = (rankingData.items || []).map((item: any, index: number) => ({
      rank: index + 1,
      id: item.id,
      title: item.title,
      thumbURL: item.thumbnail?.url || item.thumbnail?.middleUrl || '',
      views: item.count?.view || 0
    }))
    
    // 人気タグを取得
    const popularTags = extractTrendTags(serverData)
    
    console.log(`✓ ${genre}: ${items.length} items, ${popularTags.length} tags`)
    
    return {
      genre,
      items,
      popularTags,
      scrapedAt: new Date().toISOString()
    }
  } catch (error) {
    console.error(`✗ ${genre}: ${error instanceof Error ? error.message : String(error)}`)
    return {
      genre,
      items: [],
      popularTags: [],
      scrapedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// 全ジャンルのデータを取得
export async function scrapeAllGenres(
  genres?: RankingGenre[]
): Promise<ScrapedData[]> {
  // デフォルトは全ジャンル（R-18を除く）
  const targetGenres = genres || [
    'all', 'entertainment', 'radio', 'music', 'sing', 'play', 'dance',
    'vocaloid', 'nicoindies', 'animal', 'cooking', 'nature', 'travel',
    'sports', 'society', 'technology', 'handcraft', 'commentary',
    'anime', 'game', 'other', 'original'
  ]
  
  const results: ScrapedData[] = []
  
  // 順次実行（レート制限対策）
  for (const genre of targetGenres) {
    const data = await scrapeRankingData(genre)
    results.push(data)
    
    // 次のリクエストまで1秒待機
    if (genre !== targetGenres[targetGenres.length - 1]) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  return results
}

// KVにデータを送信
export async function updateKVData(
  data: ScrapedData,
  apiUrl: string,
  cronSecret: string
): Promise<boolean> {
  try {
    const fetch = getFetch()
    const response = await fetch(`${apiUrl}/api/kv-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': cronSecret
      },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      console.error(`KV update failed for ${data.genre}: ${response.status} ${response.statusText}`)
      return false
    }
    
    const result = await response.json()
    return result.success === true
  } catch (error) {
    console.error(`KV update error for ${data.genre}:`, error)
    return false
  }
}

// メイン関数
export async function main() {
  const apiUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : 'https://nico-ranking-custom.vercel.app'
  
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    throw new Error('CRON_SECRET is not set')
  }
  
  console.log('Starting ranking data scraping...')
  console.log(`API URL: ${apiUrl}`)
  
  // 全ジャンルのデータを取得
  const scrapedData = await scrapeAllGenres()
  
  // バッチ更新APIを使用
  const batchData = scrapedData.filter(d => !d.error)
  
  if (batchData.length > 0) {
    try {
      const fetch = getFetch()
      const response = await fetch(`${apiUrl}/api/kv-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cron-Secret': cronSecret,
          'X-Batch-Update': 'true'
        },
        body: JSON.stringify({ updates: batchData })
      })
      
      if (!response.ok) {
        throw new Error(`Batch update failed: ${response.status}`)
      }
      
      const result = await response.json()
      console.log(`\n✓ Batch update successful: ${result.updated?.length || 0} genres updated`)
    } catch (error) {
      console.error('Batch update failed:', error)
      
      // フォールバック：個別更新
      console.log('Falling back to individual updates...')
      const updated: string[] = []
      const failed: string[] = []
      
      for (const data of batchData) {
        const success = await updateKVData(data, apiUrl, cronSecret)
        if (success) {
          updated.push(data.genre)
        } else {
          failed.push(data.genre)
        }
      }
      
      console.log(`\nIndividual updates: ${updated.length} success, ${failed.length} failed`)
    }
  }
  
  // サマリー
  const successful = scrapedData.filter(d => !d.error).length
  const failed = scrapedData.filter(d => d.error).length
  
  console.log('\n=== Summary ===')
  console.log(`Total genres: ${scrapedData.length}`)
  console.log(`Successful: ${successful}`)
  console.log(`Failed: ${failed}`)
  
  if (failed > 0) {
    console.log('\nFailed genres:')
    scrapedData.filter(d => d.error).forEach(d => {
      console.log(`- ${d.genre}: ${d.error}`)
    })
  }
  
  return {
    success: failed === 0,
    updated: scrapedData.filter(d => !d.error).map(d => d.genre),
    failed: scrapedData.filter(d => d.error).map(d => d.genre)
  }
}

// スクリプトとして実行された場合
if (require.main === module) {
  main()
    .then(result => {
      process.exit(result.success ? 0 : 1)
    })
    .catch(error => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}