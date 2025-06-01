import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import type { RankingGenre } from '@/types/ranking-config'

export const runtime = 'edge'

export async function GET() {
  try {
    const genres: RankingGenre[] = [
      'all', 'game', 'anime', 'vocaloid', 'voicesynthesis', 'entertainment',
      'music', 'sing', 'dance', 'play', 'commentary', 'cooking', 'travel',
      'nature', 'vehicle', 'technology', 'society', 'mmd', 'vtuber',
      'radio', 'sports', 'animal', 'other'
    ]
    
    const status: Record<string, any> = {}
    let hasPopularTags = 0
    let totalGenres = 0
    let lastUpdate: string | null = null
    
    for (const genre of genres) {
      const key = `ranking-${genre}`
      const data = await kv.get<{
        items: any[]
        popularTags: string[]
        updatedAt: string
        scrapedAt?: string
      }>(key)
      
      if (data) {
        totalGenres++
        if (data.popularTags && data.popularTags.length > 0) {
          hasPopularTags++
        }
        
        if (!lastUpdate || (data.updatedAt && data.updatedAt > lastUpdate)) {
          lastUpdate = data.updatedAt
        }
        
        status[genre] = {
          exists: true,
          itemCount: data.items?.length || 0,
          popularTagsCount: data.popularTags?.length || 0,
          hasPopularTags: (data.popularTags?.length || 0) > 0,
          updatedAt: data.updatedAt,
          scrapedAt: data.scrapedAt
        }
      } else {
        status[genre] = {
          exists: false,
          hasPopularTags: false
        }
      }
    }
    
    return NextResponse.json({
      summary: {
        totalGenres: genres.length,
        genresWithData: totalGenres,
        genresWithPopularTags: hasPopularTags,
        lastUpdate,
        dataCompleteness: Math.round((totalGenres / genres.length) * 100) + '%',
        popularTagsCompleteness: Math.round((hasPopularTags / genres.length) * 100) + '%'
      },
      genres: status,
      githubActions: {
        schedule: '毎時15分と45分',
        nextRuns: getNextRunTimes()
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to get status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

function getNextRunTimes(): string[] {
  const now = new Date()
  const runs: string[] = []
  
  // 次の2回の実行時刻を計算
  for (let i = 0; i < 2; i++) {
    const next = new Date(now)
    
    if (now.getMinutes() < 15) {
      next.setMinutes(15, 0, 0)
    } else if (now.getMinutes() < 45) {
      next.setMinutes(45, 0, 0)
    } else {
      next.setHours(next.getHours() + 1, 15, 0, 0)
    }
    
    if (i === 1) {
      next.setMinutes(next.getMinutes() === 15 ? 45 : 15)
      if (next.getMinutes() === 15) {
        next.setHours(next.getHours() + 1)
      }
    }
    
    runs.push(next.toISOString())
  }
  
  return runs
}