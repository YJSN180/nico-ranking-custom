import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { fetchNicoRanking } from '@/lib/fetch-rss'
import { fetchVideoInfoBatch } from '@/lib/nico-api'
import { mockRankingData } from '@/lib/mock-data'
import { getPopularTags } from '@/lib/popular-tags'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = {
      success: 0,
      failed: 0,
      patterns: [] as string[]
    }

    // すべてのジャンル
    const genres: RankingGenre[] = [
      'all', 'entertainment', 'radio', 'music_sound', 'dance',
      'anime', 'game', 'animal', 'cooking', 'nature',
      'sports', 'society_politics_news', 'technology_craft', 'other', 'r18'
    ]
    
    // すべての期間
    const periods: RankingPeriod[] = ['24h', 'hour']

    // 1. ジャンル別ランキングを取得
    for (const genre of genres) {
      for (const period of periods) {
        const cacheKey = `ranking-${period}-${genre}`
        
        try {
          // RSSからランキングを取得
          const items = await fetchNicoRanking(period, genre)
          
          if (items.length > 0) {
            // 動画の詳細情報を取得
            const contentIds = items.map(item => item.id)
            const videoInfoMap = await fetchVideoInfoBatch(contentIds)
            
            // 詳細情報を統合
            const enrichedItems = items.map(item => {
              const videoInfo = videoInfoMap.get(item.id)
              if (videoInfo) {
                return {
                  ...item,
                  views: videoInfo.viewCounter,
                  comments: videoInfo.commentCounter,
                  mylists: videoInfo.mylistCounter,
                  likes: videoInfo.likeCounter,
                  thumbURL: videoInfo.thumbnail.largeUrl || videoInfo.thumbnail.url || item.thumbURL
                }
              }
              return item
            })
            
            // KVに保存
            const ttl = period === 'hour' ? 3600 : 1800
            await kv.set(cacheKey, enrichedItems, { ex: ttl })
            
            results.success++
            results.patterns.push(cacheKey)
          }
        } catch (error) {
          console.error(`Failed to fetch ${cacheKey}:`, error)
          results.failed++
        }
      }
    }

    // 2. 人気タグのランキングを取得（各ジャンル上位5タグのみ）
    for (const genre of genres) {
      const popularTags = getPopularTags(genre, 5) // 上位5タグに制限
      
      for (const tag of popularTags) {
        for (const period of periods) {
          const cacheKey = `ranking-tag-${period}-${genre}-${tag}`
          
          try {
            const items = await fetchNicoRanking(period, genre, tag)
            
            if (items.length > 0) {
              const contentIds = items.map(item => item.id)
              const videoInfoMap = await fetchVideoInfoBatch(contentIds)
              
              const enrichedItems = items.map(item => {
                const videoInfo = videoInfoMap.get(item.id)
                if (videoInfo) {
                  return {
                    ...item,
                    views: videoInfo.viewCounter,
                    comments: videoInfo.commentCounter,
                    mylists: videoInfo.mylistCounter,
                    likes: videoInfo.likeCounter,
                    thumbURL: videoInfo.thumbnail.largeUrl || videoInfo.thumbnail.url || item.thumbURL
                  }
                }
                return item
              })
              
              const ttl = 900 // タグランキングは15分
              await kv.set(cacheKey, enrichedItems, { ex: ttl })
              
              results.success++
              results.patterns.push(cacheKey)
            }
          } catch (error) {
            console.error(`Failed to fetch tag ranking ${cacheKey}:`, error)
            results.failed++
          }
        }
      }
    }

    // 旧形式のキーも更新（後方互換性のため）
    try {
      const items = await fetchNicoRanking()
      await kv.set('ranking-data', items, { ex: 3600 })
    } catch (error) {
      console.error('Failed to update legacy ranking-data key:', error)
    }

    // 更新情報を保存
    await kv.set('last-update-info', {
      timestamp: new Date().toISOString(),
      patterns: results.patterns,
      success: results.success,
      failed: results.failed,
      source: 'scheduled-cron'
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch ranking' },
      { status: 500 }
    )
  }
}