import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { fetchRankingWithRetry } from '@/lib/complete-hybrid-scraper'
import { filterRankingData } from '@/lib/ng-filter'
import { sortTagsByPopularity, getPopularTagsByUsage } from '@/lib/tag-popularity-tracker'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'

// 人気タグのキャッシュ数を5から10に増やす
const POPULAR_TAGS_TO_CACHE = 10

// ジャンルと期間の組み合わせ
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

    // 全ジャンル・期間の組み合わせを取得
    for (const genre of genres) {
      for (const period of periods) {
        try {
          console.log(`[Cron] Fetching ${genre} (${period})...`)
          
          // NGフィルタリング後に300件確保するため、多めに取得
          const targetCount = 300
          const maxPages = 5
          let page = 1
          let allItems: any[] = []

          // 必要な件数が集まるまで複数ページを取得
          while (allItems.length < targetCount && page <= maxPages) {
            const { items: pageItems, popularTags } = await fetchRankingWithRetry(
              genre,
              period,
              undefined,
              100,
              page
            )

            // NGフィルタリングを適用
            const { items: filteredItems } = await filterRankingData({
              items: pageItems
            })

            allItems = allItems.concat(filteredItems)
            page++

            // 人気タグは最初のページからのみ取得
            if (page === 2 && popularTags && popularTags.length > 0) {
              // 24時間ランキングの人気タグをキャッシュ（allジャンルは除外）
              if (period === '24h' && genre !== 'all') {
                console.log(`[Cron] Caching popular tags for ${genre}:`, popularTags.slice(0, POPULAR_TAGS_TO_CACHE))
                
                // 使用統計に基づいてタグをソート
                const genreStats = await kv.get(`tag-popularity-stats`) as any
                const sortedTags = sortTagsByPopularity(
                  popularTags,
                  genreStats?.[genre]
                )
                
                // 使用統計から追加の人気タグを取得
                const usageBasedTags = await getPopularTagsByUsage(genre, POPULAR_TAGS_TO_CACHE)
                
                // デフォルトの人気タグと使用統計タグをマージ（重複排除）
                const tagsToCache = Array.from(new Set([
                  ...sortedTags.slice(0, POPULAR_TAGS_TO_CACHE),
                  ...usageBasedTags
                ])).slice(0, POPULAR_TAGS_TO_CACHE)
                
                // 人気タグのランキングを並行してキャッシュ
                const tagPromises = tagsToCache.map(async (tag) => {
                  try {
                    console.log(`[Cron] Fetching tag ranking: ${genre}/${tag}`)
                    const { items: tagItems } = await fetchRankingWithRetry(
                      genre,
                      period,
                      tag,
                      100,
                      1
                    )
                    
                    // NGフィルタリングを適用
                    const { items: filteredTagItems } = await filterRankingData({
                      items: tagItems
                    })
                    
                    const tagCacheKey = `ranking-${genre}-${period}-tag-${tag}`
                    await kv.set(tagCacheKey, filteredTagItems, {
                      ex: 3600 // 1時間TTL
                    })
                    
                    console.log(`[Cron] Cached tag ranking: ${genre}/${tag} (${filteredTagItems.length} items)`)
                  } catch (tagError) {
                    console.error(`[Cron] Failed to cache tag ${genre}/${tag}:`, tagError)
                  }
                })
                
                await Promise.all(tagPromises)
              }
            }
          }

          // 最大300件に制限
          const items = allItems.slice(0, targetCount)
          
          // KVにキャッシュ（1時間TTL）
          const cacheKey = `ranking-${genre}-${period}`
          await kv.set(cacheKey, {
            items,
            popularTags: period === '24h' ? (await fetchRankingWithRetry(genre, period)).popularTags : []
          }, {
            ex: 3600 // 1時間
          })

          // 古いフォーマットとの互換性（24時間ランキングのみ）
          if (period === '24h') {
            await kv.set(`ranking-${genre}`, {
              items,
              popularTags: (await fetchRankingWithRetry(genre, period)).popularTags
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
            pagesNeeded: page - 1
          })

          console.log(`[Cron] Cached ${genre} (${period}): ${items.length} items (${page - 1} pages)`)
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
      timestamp: new Date().toISOString()
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