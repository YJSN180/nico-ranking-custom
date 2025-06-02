import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { fetchRankingWithRetry } from '@/lib/complete-hybrid-scraper'
import { filterRankingData } from '@/lib/ng-filter'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'

// タグの事前キャッシュを完全に廃止し、ジャンル別ランキングのみ事前キャッシュ
const genres: RankingGenre[] = ['all', 'game', 'entertainment', 'music', 'other', 'tech', 'anime', 'animal', 'd2um7mc4']
const periods: RankingPeriod[] = ['24h', 'hour']

export const runtime = 'nodejs'
export const maxDuration = 300 // 5分

export async function GET(request: NextRequest) {
  try {
    // 簡易的な認証チェック
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const startTime = Date.now()
    const results = []
    const errors = []

    // 全ジャンル・期間の組み合わせを取得（タグは除外）
    for (const genre of genres) {
      for (const period of periods) {
        try {
          console.log(`[Cron] Fetching ${genre} (${period})...`)
          
          // NGフィルタリング後に300件確保するため、多めに取得
          const targetCount = 300
          const maxPages = 5
          let page = 1
          let allItems: any[] = []
          let popularTags: string[] = []

          // 必要な件数が集まるまで複数ページを取得
          while (allItems.length < targetCount && page <= maxPages) {
            const result = await fetchRankingWithRetry(
              genre,
              period,
              undefined,
              100,
              page
            )

            // NGフィルタリングを適用
            const { items: filteredItems } = await filterRankingData({
              items: result.items
            })

            allItems = allItems.concat(filteredItems)
            
            // 人気タグは最初のページからのみ取得
            if (page === 1 && result.popularTags) {
              popularTags = result.popularTags
              
              // 人気タグリストを別途保存（UIでの表示用）
              if (period === '24h' && genre !== 'all') {
                await kv.set(`popular-tags-${genre}`, popularTags, {
                  ex: 86400 // 24時間
                })
              }
            }
            
            page++
          }

          // 最大300件に制限
          const items = allItems.slice(0, targetCount)
          
          // KVにキャッシュ（1時間TTL）
          const cacheKey = `ranking-${genre}-${period}`
          await kv.set(cacheKey, {
            items,
            popularTags
          }, {
            ex: 3600 // 1時間
          })

          // 古いフォーマットとの互換性（24時間ランキングのみ）
          if (period === '24h') {
            await kv.set(`ranking-${genre}`, {
              items,
              popularTags
            }, {
              ex: 3600
            })
          }

          results.push({
            genre,
            period,
            success: true,
            itemCount: items.length,
            unfilteredCount: allItems.length,
            pagesNeeded: page - 1,
            popularTagsCount: popularTags.length
          })

          console.log(`[Cron] Cached ${genre} (${period}): ${items.length} items, ${popularTags.length} tags`)
        } catch (error) {
          console.error(`[Cron] Error fetching ${genre} (${period}):`, error)
          errors.push({
            genre,
            period,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          results.push({
            genre,
            period,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
    }

    const endTime = Date.now()
    const duration = (endTime - startTime) / 1000

    // タグ使用統計のクリーンアップ（30日以上アクセスのないタグを削除）
    try {
      const { cleanupOldTagStats } = await import('@/lib/tag-popularity-tracker')
      await cleanupOldTagStats()
      console.log('[Cron] Cleaned up old tag statistics')
    } catch (error) {
      console.error('[Cron] Failed to cleanup tag stats:', error)
    }

    console.log(`[Cron] Completed in ${duration.toFixed(2)}s`)
    console.log(`[Cron] Success: ${results.filter(r => r.success).length}/${results.length}`)
    if (errors.length > 0) {
      console.error('[Cron] Errors:', errors)
    }

    return NextResponse.json({
      success: true,
      duration: `${duration.toFixed(2)}s`,
      results,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
      note: 'Tag rankings are now fully dynamic and not pre-cached'
    })
  } catch (error) {
    console.error('[Cron] Fatal error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}