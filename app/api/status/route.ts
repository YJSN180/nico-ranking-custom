import { NextResponse } from 'next/server'
import { getRankingFromKV } from '@/lib/cloudflare-kv'
import type { RankingGenre } from '@/types/ranking-config'

export const runtime = 'nodejs' // Changed from edge to nodejs for KV access

export async function GET() {
  try {
    const genres: RankingGenre[] = [
      'all', 'game', 'anime', 'vocaloid', 'voicesynthesis', 'entertainment',
      'music', 'sing', 'dance', 'play', 'commentary', 'cooking', 'travel',
      'nature', 'vehicle', 'technology', 'society', 'mmd', 'vtuber',
      'radio', 'sports', 'animal', 'other'
    ]
    
    // Get the single aggregated data from KV
    const allData = await getRankingFromKV()
    
    const status: Record<string, any> = {}
    let hasPopularTags = 0
    let totalGenres = 0
    let lastUpdate: string | null = null
    
    if (allData && allData.metadata) {
      lastUpdate = allData.metadata.updatedAt
    }
    
    for (const genre of genres) {
      if (allData && allData.genres && allData.genres[genre]) {
        const genreData = allData.genres[genre]
        totalGenres++
        
        // Check if any period has popular tags
        const has24hTags = genreData['24h']?.popularTags?.length > 0
        const hasHourTags = genreData['hour']?.popularTags?.length > 0
        
        if (has24hTags || hasHourTags) {
          hasPopularTags++
        }
        
        status[genre] = {
          exists: true,
          itemCount24h: genreData['24h']?.items?.length || 0,
          itemCountHour: genreData['hour']?.items?.length || 0,
          popularTagsCount24h: genreData['24h']?.popularTags?.length || 0,
          popularTagsCountHour: genreData['hour']?.popularTags?.length || 0,
          hasPopularTags: has24hTags || hasHourTags
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
        schedule: '毎時0分と30分',
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
  
  // 次の2回の実行時刻を計算 (0分と30分)
  for (let i = 0; i < 2; i++) {
    const next = new Date(now)
    
    if (i === 0) {
      // First next run
      if (now.getMinutes() < 30) {
        next.setMinutes(30, 0, 0)
      } else {
        next.setHours(next.getHours() + 1, 0, 0, 0)
      }
    } else {
      // Second next run
      if (runs[0].includes(':30:')) {
        // If first run is at :30, next is at :00 of next hour
        const firstRun = new Date(runs[0])
        firstRun.setHours(firstRun.getHours() + 1, 0, 0, 0)
        runs.push(firstRun.toISOString())
        continue
      } else {
        // If first run is at :00, next is at :30 of same hour
        const firstRun = new Date(runs[0])
        firstRun.setMinutes(30, 0, 0)
        runs.push(firstRun.toISOString())
        continue
      }
    }
    
    runs.push(next.toISOString())
  }
  
  return runs
}