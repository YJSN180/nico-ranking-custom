#!/usr/bin/env npx tsx
import { fetchVideoStats } from '../lib/snapshot-api'
import type { RankingData } from '../types/ranking'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

const STATS_KEY = 'VIDEO_STATS_LATEST'

export async function updateVideoStats() {
  // eslint-disable-next-line no-console
  console.log('Starting video stats update...')
  
  try {
    // 1. Fetch current ranking data from R2
    const rankingData = await getRankingFromR2()
    if (!rankingData) {
      // eslint-disable-next-line no-console
      console.error('No ranking data found in R2')
      if (import.meta.url === `file://${process.argv[1]}`) {
        process.exit(1)
      }
      throw new Error('No ranking data found in R2')
    }
    
    // 2. Extract all unique video IDs
    const videoIds = extractUniqueVideoIds(rankingData)
    // eslint-disable-next-line no-console
    console.log(`Found ${videoIds.length} unique videos to update`)
    
    // 3. If no videos found, still write empty stats to KV
    if (videoIds.length === 0) {
      const emptyStats = {
        stats: {},
        metadata: {
          version: 1,
          updatedAt: new Date().toISOString(),
          totalVideos: 0
        }
      }
      await writeToKV(STATS_KEY, JSON.stringify(emptyStats))
      // eslint-disable-next-line no-console
      console.log('Successfully updated stats for 0 videos')
      return
    }
    
    // 4. Fetch stats using optimized batch processing
    // eslint-disable-next-line no-console
    console.log('Fetching video statistics using jsonFilter batch method...')
    // eslint-disable-next-line no-console
    console.log(`Processing ${videoIds.length} videos in batches of 50...`)
    const startTime = Date.now()
    
    // Enable debug logging for production (removed - was causing lint errors)
    
    // fetchVideoStats now handles batching internally with jsonFilter
    const allStats = await fetchVideoStats(videoIds)
    
    const fetchTime = Date.now() - startTime
    // eslint-disable-next-line no-console
    console.log(`Fetched stats for ${Object.keys(allStats).length} videos in ${(fetchTime / 1000).toFixed(1)}s`)
    
    // Log sample of retrieved stats for debugging
    const sampleIds = Object.keys(allStats).slice(0, 5)
    if (sampleIds.length > 0) {
      // eslint-disable-next-line no-console
      console.log('Sample stats retrieved:')
      sampleIds.forEach(id => {
        // eslint-disable-next-line no-console
        console.log(`  ${id}: ${allStats[id].viewCounter} views`)
      })
    }
    
    // 5. Create data structure
    const statsData = {
      stats: allStats,
      metadata: {
        version: 1,
        updatedAt: new Date().toISOString(),
        totalVideos: Object.keys(allStats).length
      }
    }
    
    // 6. Write to KV (no compression)
    await writeToKV(STATS_KEY, JSON.stringify(statsData))
    
    // eslint-disable-next-line no-console
    console.log(`Successfully updated stats for ${Object.keys(allStats).length} videos`)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to update video stats:', error)
    if (import.meta.url === `file://${process.argv[1]}`) {
      process.exit(1)
    }
    throw error
  }
}

// Fetch ranking data from R2
async function getRankingFromR2(): Promise<RankingData | null> {
  try {
    const r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
    })

    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || 'nico-ranking-data',
      Key: 'rankings/metadata.json',
    })

    const response = await r2Client.send(command)
    const metadataStr = await response.Body?.transformToString()
    if (!metadataStr) {
      throw new Error('No metadata found in R2')
    }

    const metadata = JSON.parse(metadataStr)
    const allData: RankingData = {
      genres: {},
      metadata: metadata.metadata
    }

    // すべてのジャンルのデータを取得
    for (const genre of metadata.genres || []) {
      const genreCommand = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME || 'nico-ranking-data',
        Key: `rankings/${genre}/data.json`,
      })
      
      try {
        const genreResponse = await r2Client.send(genreCommand)
        const genreDataStr = await genreResponse.Body?.transformToString()
        if (genreDataStr) {
          const genreData = JSON.parse(genreDataStr)
          allData.genres[genre] = genreData
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`Failed to fetch data for genre ${genre}:`, error)
      }
    }

    return allData
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch ranking data from R2:', error)
    return null
  }
}

// Extract unique video IDs from ranking data
function extractUniqueVideoIds(rankingData: RankingData): string[] {
  const videoIds = new Set<string>()
  
  if (!rankingData?.genres) {
    return []
  }
  
  for (const genre of Object.keys(rankingData.genres)) {
    for (const period of ['24h', 'hour'] as const) {
      const items = rankingData.genres[genre]?.[period]?.items || []
      items.forEach((item) => videoIds.add(item.id))
    }
  }
  
  return Array.from(videoIds)
}

// Write data to KV
async function writeToKV(key: string, data: string): Promise<void> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CLOUDFLARE_KV_NAMESPACE_ID}/values/${key}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.CLOUDFLARE_KV_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: data
    }
  )
  
  if (!response.ok) {
    throw new Error(`KV write failed: ${response.status} ${response.statusText}`)
  }
}

// Export for testing
export { extractUniqueVideoIds, writeToKV }

// Run the update only if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateVideoStats()
}