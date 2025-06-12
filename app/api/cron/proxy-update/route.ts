import { NextResponse } from 'next/server'
import { kv } from '@/lib/simple-kv'
import { scrapeRankingViaProxy } from '@/lib/proxy-scraper'
import type { RankingData } from '@/types/ranking'
import type { RankingGenre } from '@/types/ranking-config'

export const runtime = 'nodejs'

// 更新するランキングの設定
const RANKINGS_TO_UPDATE: Array<{ genre: RankingGenre; term: '24h' | 'hour' }> = [
  // 総合ランキング
  { genre: 'all', term: '24h' },
  { genre: 'all', term: 'hour' },
  // 主要ジャンル - 24時間
  { genre: 'game', term: '24h' },
  { genre: 'anime', term: '24h' },
  { genre: 'vocaloid', term: '24h' },
  { genre: 'voicesynthesis', term: '24h' },
  { genre: 'entertainment', term: '24h' },
  { genre: 'music', term: '24h' },
  { genre: 'sing', term: '24h' },
  { genre: 'dance', term: '24h' },
  { genre: 'play', term: '24h' },
  { genre: 'commentary', term: '24h' },
  { genre: 'cooking', term: '24h' },
  { genre: 'travel', term: '24h' },
  { genre: 'nature', term: '24h' },
  { genre: 'vehicle', term: '24h' },
  { genre: 'technology', term: '24h' },
  { genre: 'society', term: '24h' },
  { genre: 'mmd', term: '24h' },
  { genre: 'vtuber', term: '24h' },
  { genre: 'radio', term: '24h' },
  { genre: 'sports', term: '24h' },
  { genre: 'animal', term: '24h' },
  { genre: 'other', term: '24h' },
  // 人気ジャンル - 毎時
  { genre: 'game', term: 'hour' },
  { genre: 'anime', term: 'hour' },
  { genre: 'vocaloid', term: 'hour' },
  { genre: 'other', term: 'hour' }
]

export async function POST(request: Request) {
  // 認証チェック
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // プロキシサーバーが設定されているか確認
  if (!process.env.PROXY_URL) {
    return NextResponse.json(
      { error: 'Proxy server not configured' },
      { status: 503 }
    )
  }

  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
    updated: [] as string[]
  }

  // 各ランキングを順次更新
  for (const config of RANKINGS_TO_UPDATE) {
    try {
      // プロキシ経由でスクレイピング
      const data = await scrapeRankingViaProxy(
        config.genre,
        config.term
      )

      if (data && data.items.length > 0) {
        // KVに保存
        const key = `ranking:${config.genre}:${config.term}`
        await kv.set(key, data, {
          ex: 3600 // 1時間のTTL
        })

        results.success++
        results.updated.push(`${config.genre}:${config.term}`)
      } else {
        results.failed++
        results.errors.push(`${config.genre}:${config.term} - No data`)
      }
    } catch (error) {
      results.failed++
      results.errors.push(
        `${config.genre}:${config.term} - ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }

    // レート制限を考慮して少し待機
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return NextResponse.json({
    message: 'Proxy update completed',
    results,
    timestamp: new Date().toISOString()
  })
}

// ヘルスチェック用のGETエンドポイント
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    proxyConfigured: !!process.env.PROXY_URL,
    rankingsToUpdate: RANKINGS_TO_UPDATE.length,
    timestamp: new Date().toISOString()
  })
}