#!/usr/bin/env npx tsx
import type { RankingGenre } from '../types/ranking-config'
import type { RankingItem } from '../types/ranking'
import type { TagFetchRunStats } from '../lib/tag-fetcher-simple'
import { kv } from '../lib/simple-kv'
import {
  getTagFetchRunStats,
  resetTagFetchRunStats,
} from '../lib/tag-fetcher-simple'
import { createCoreNgFilter } from '../lib/pipeline/ng-filter'
import { buildGenreRanking } from '../lib/pipeline/run-update'
import {
  createTagEnricher,
  getTagEnrichmentSettingsFromEnv,
} from '../lib/pipeline/tag-enrichment'
import { writeRankingToCloudflareKVApi } from '../lib/pipeline/storage'
import { fetchRankingPageWithRetry } from '../lib/pipeline/fetch-ranking'
import { GENRE_ID_MAP as STATIC_GENRE_ID_MAP } from '../lib/genre-mapping'
import * as fs from 'fs/promises'
import * as path from 'path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

// All 23 genres to fetch
const ALL_GENRES: RankingGenre[] = [
  'all',
  'game',
  'anime',
  'vocaloid',
  'voicesynthesis',
  'entertainment',
  'music',
  'sing',
  'dance',
  'play',
  'commentary',
  'cooking',
  'travel',
  'nature',
  'vehicle',
  'technology',
  'society',
  'mmd',
  'vtuber',
  'radio',
  'sports',
  'animal',
  'other',
]

// Dynamic genre ID mapping (can be updated at runtime)
const GENRE_ID_MAP: Record<RankingGenre, string> = { ...STATIC_GENRE_ID_MAP }

// Custom group definitions for 8-group strategy
const CUSTOM_GROUPS: string[][] = [
  ['all', 'game'], // Group 1
  ['anime', 'vocaloid'], // Group 2
  ['voicesynthesis', 'entertainment'], // Group 3
  ['music', 'sing'], // Group 4
  ['dance', 'play', 'commentary', 'cooking'], // Group 5 (old Group 3)
  ['travel', 'nature', 'vehicle', 'technology'], // Group 6 (old Group 4)
  ['society', 'mmd', 'vtuber', 'radio'], // Group 7 (old Group 5)
  ['sports', 'animal', 'other'], // Group 8 (old Group 6)
]

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'nico-ranking'

function shouldUploadTagFetchLogs(): boolean {
  return process.env.TAG_FETCH_LOG_TO_R2 === 'true'
}

function createR2Client(): S3Client | null {
  if (
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY ||
    !process.env.CLOUDFLARE_ACCOUNT_ID
  ) {
    return null
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

async function uploadTagFetchStatsToR2(
  stats: TagFetchRunStats,
  meta: { groupId?: number; totalGroups?: number; genres?: RankingGenre[] },
): Promise<void> {
  if (!shouldUploadTagFetchLogs()) {
    return
  }

  const client = createR2Client()
  if (!client) {
    console.warn('[Tag Fetch Logs] R2 credentials missing, skipping upload')
    return
  }

  const runId = process.env.GITHUB_RUN_ID || 'local'
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT || '1'
  const groupLabel = meta.groupId
    ? `group-${meta.groupId}`
    : process.env.TAG_FETCH_LOG_GROUP || process.env.GITHUB_JOB || 'unknown'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const datePrefix = new Date().toISOString().slice(0, 10)

  const payload = {
    run: {
      id: runId,
      attempt: runAttempt,
      job: process.env.GITHUB_JOB || '',
      sha: process.env.GITHUB_SHA || '',
      ref: process.env.GITHUB_REF_NAME || '',
      workflow: process.env.GITHUB_WORKFLOW || '',
    },
    group: {
      id: meta.groupId ?? null,
      total: meta.totalGroups ?? null,
      genres: meta.genres ?? [],
    },
    stats,
    generatedAt: new Date().toISOString(),
  }

  const key = `logs/tag-fetch/${datePrefix}/run-${runId}-attempt-${runAttempt}/${groupLabel}-${timestamp}.json`

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: JSON.stringify(payload),
        ContentType: 'application/json',
        Metadata: {
          runId,
          runAttempt,
          group: groupLabel,
          sha: process.env.GITHUB_SHA || '',
        },
      }),
    )
    console.log(`[Tag Fetch Logs] Uploaded summary to R2: ${key}`)
  } catch (error) {
    console.warn('[Tag Fetch Logs] Failed to upload summary to R2:', error)
  }
}

// NG list interface (matching frontend structure)
interface NGList {
  videoIds: string[]
  videoTitles: {
    exact: string[]
    partial: string[]
  }
  authorIds: string[]
  authorNames: {
    exact: string[]
    partial: string[]
  }
  derivedVideoIds: string[]
}

// Legacy NG list for backwards compatibility
interface LegacyNGList {
  videoIds: string[]
  videoTitles: string[]
  authorIds: string[]
  authorNames: string[]
  derivedVideoIds: string[]
}

// Migrate legacy NG list to new structure
function migrateLegacyNGList(data: any): NGList {
  // If already in new format, return as-is
  if (
    data.videoTitles &&
    typeof data.videoTitles === 'object' &&
    Array.isArray(data.videoTitles.exact)
  ) {
    return data as NGList
  }

  // Convert legacy format to new structure
  const legacy = data as LegacyNGList
  return {
    videoIds: legacy.videoIds || [],
    videoTitles: {
      exact: legacy.videoTitles || [],
      partial: [],
    },
    authorIds: legacy.authorIds || [],
    authorNames: {
      exact: legacy.authorNames || [],
      partial: [],
    },
    derivedVideoIds: legacy.derivedVideoIds || [],
  }
}

// Get NG list - always fetch fresh from KV to ensure latest data
async function getNGList(): Promise<NGList> {
  try {
    // Always fetch fresh NG list from KV to ensure we have the latest data
    // This prevents issues where admin updates NG list between GitHub Actions runs
    console.log('Fetching fresh NG list from KV')
    const [manual, derived] = await Promise.all([
      kv.get<any>('ng-list-manual'),
      kv.get<string[]>('ng-list-derived'),
    ])

    const legacyData = {
      videoIds: manual?.videoIds || [],
      videoTitles: manual?.videoTitles || [],
      authorIds: manual?.authorIds || [],
      authorNames: manual?.authorNames || [],
      derivedVideoIds: derived || [],
    }

    return migrateLegacyNGList(legacyData)
  } catch (error) {
    console.error('Failed to fetch NG list:', error)
    return {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      derivedVideoIds: [],
    }
  }
}

const tagEnrichmentSettings = getTagEnrichmentSettingsFromEnv()
const tagEnricher = createTagEnricher(tagEnrichmentSettings)

// Process single genre (both periods at once to share popular tags)
async function processGenre(
  genre: RankingGenre,
  ngList: NGList,
): Promise<{
  genre: RankingGenre
  data: {
    '24h': {
      items: RankingItem[]
      popularTags: string[]
      tags: Record<string, RankingItem[]>
    }
    hour: {
      items: RankingItem[]
      popularTags: string[]
      tags: Record<string, RankingItem[]>
    }
  }
}> {
  console.log(`[${new Date().toISOString()}] Starting ${genre}...`)

  const enableTagFetching = tagEnrichmentSettings.enabled
  const tagFetchMaxVideos = tagEnrichmentSettings.maxVideos
  const tagFetchGenres = tagEnrichmentSettings.allowedGenres
  const enableTagFetchingForTagRankings =
    tagEnrichmentSettings.enableForTagRankings
  const shouldTagFetch =
    enableTagFetching &&
    (tagFetchGenres.length === 0 || tagFetchGenres.includes(genre))

  if (enableTagFetching) {
    console.log(
      `[${new Date().toISOString()}] Tag details fetching enabled for ${genre}: maxVideos=${tagFetchMaxVideos}, tagRankings=${enableTagFetchingForTagRankings}`,
    )
  }

  if (shouldTagFetch) {
    console.log(
      `[${new Date().toISOString()}] Fetching tag details for ${genre}...`,
    )
  }

  const ngFilter = createCoreNgFilter(ngList)

  const result = await buildGenreRanking(
    {
      genres: [genre],
      periods: ['24h', 'hour'],
      targetCount: 1000,
      maxPages: 10,
      periodDelayMs: 1000,
      pageDelayMs: 500,
      dedupe: false,
      stopWhenPageItemsLessThan: 100,
      onError: 'break',
      fetchPage: (genre, period, tag, page) =>
        fetchRankingPageWithRetry(genre, period, tag, page, 3, GENRE_ID_MAP),
      normalizeItems: (items) => items,
      filterItems: (items) => ngFilter(items),
      onDerivedIds: (newDerivedIds, context) => {
        if (newDerivedIds.length > 0) {
          ngList.derivedVideoIds.push(...newDerivedIds)
          console.log(
            `Found ${newDerivedIds.length} new derived IDs for ${genre}/${context.period} page ${context.page}`,
          )
        }
      },
      onFetchError: (error, context) => {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('404')) {
          console.log(
            `Reached end of pages for ${genre}/${context.period} at page ${context.page} (404 - this is normal)`,
          )
        } else {
          console.error(
            `Failed to fetch page ${context.page} for ${genre}/${context.period}:`,
            error,
          )
        }
      },
      includeTagRankings: true,
      tagTargetCount: 300,
      tagMaxPages: 10,
      tagBetweenDelayMs: 1000,
      tagPageDelayMs: 500,
      tagDedupe: false,
      tagStopWhenPageItemsLessThan: 100,
      tagOnError: 'break',
      popularTagsStrategy: 'shared',
      tagFetchOrder: 'tag-first',
      tagEnrichment: async (items, context) =>
        tagEnricher(items, {
          genre: context.genre,
          period: context.period,
          kind: context.kind,
          tag: context.tag,
        }),
    },
    genre,
  )

  const popularTags = result.data['24h'].popularTags

  console.log(
    `[${new Date().toISOString()}] Completed ${genre} (24h: ${result.data['24h'].items.length} items, hour: ${result.data.hour.items.length} items, ${popularTags.length} tags)`,
  )

  // DEBUG: Tag fetching results
  console.log(
    `[DEBUG] Stored ${Object.keys(result.data['24h'].tags).length} tags for ${genre}/24h`,
  )
  console.log(
    `[DEBUG] Stored ${Object.keys(result.data.hour.tags).length} tags for ${genre}/hour`,
  )
  if (Object.keys(result.data['24h'].tags).length > 0) {
    const firstTag = Object.keys(result.data['24h'].tags)[0]
    console.log(
      `[DEBUG] Sample tag "${firstTag}" has ${result.data['24h'].tags[firstTag].length} items`,
    )
  }

  return result
}

// Main function for parallel execution
async function main() {
  const startTime = Date.now()
  resetTagFetchRunStats()

  try {
    console.log('Starting improved parallel ranking update...')
    console.log(
      `Processing ${ALL_GENRES.length} genres × 2 periods = ${ALL_GENRES.length * 2} combinations`,
    )

    // Get NG list
    const ngList = await getNGList()
    const originalDerivedCount = ngList.derivedVideoIds.length
    console.log(
      `NG list loaded: ${ngList.videoIds.length} video IDs, ${ngList.videoTitles.exact.length + ngList.videoTitles.partial.length} titles, ${ngList.authorIds.length} author IDs, ${ngList.authorNames.exact.length + ngList.authorNames.partial.length} author names, ${ngList.derivedVideoIds.length} derived`,
    )

    // Build final data structure
    const rankingData: any = {
      genres: {},
      metadata: {
        version: 1,
        updatedAt: new Date().toISOString(),
        totalItems: 0,
        ngFiltered: true,
      },
    }

    let totalItemsCount = 0
    const successfulGenres: string[] = []
    const failedGenres: string[] = []

    // Process genres in batches to avoid overloading
    const batchSize = 4 // Process 4 genres concurrently
    const batches: RankingGenre[][] = []

    for (let i = 0; i < ALL_GENRES.length; i += batchSize) {
      batches.push(ALL_GENRES.slice(i, i + batchSize))
    }

    console.log(
      `Processing ${batches.length} batches of up to ${batchSize} genres each`,
    )

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      console.log(
        `\nProcessing batch ${batchIndex + 1}/${batches.length}: ${batch.join(', ')}`,
      )

      // Process batch concurrently
      const batchPromises = batch.map((genre) => processGenre(genre, ngList))
      const batchResults = await Promise.all(batchPromises)

      // Add results to ranking data
      for (const result of batchResults) {
        rankingData.genres[result.genre] = result.data

        // Check if genre has data (not failed)
        if (
          result.data['24h'].items.length > 0 ||
          result.data['hour'].items.length > 0
        ) {
          successfulGenres.push(result.genre)
        } else {
          failedGenres.push(result.genre)
        }

        // Count items
        totalItemsCount += result.data['24h'].items.length
        totalItemsCount += result.data['hour'].items.length

        for (const tagItems of Object.values(result.data['24h'].tags)) {
          totalItemsCount += (tagItems as RankingItem[]).length
        }
        for (const tagItems of Object.values(result.data['hour'].tags)) {
          totalItemsCount += (tagItems as RankingItem[]).length
        }
      }

      // Add delay between batches
      if (batchIndex < batches.length - 1) {
        console.log('Waiting 2 seconds before next batch...')
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    rankingData.metadata.totalItems = totalItemsCount

    // Add derived NG data to ranking data to avoid additional KV writes
    const newDerivedCount = ngList.derivedVideoIds.length
    const newlyAdded = newDerivedCount - originalDerivedCount

    rankingData.derivativeNGData = {
      blockedVideoIds: [...ngList.derivedVideoIds], // Copy array
      blockedAuthorIds: [], // Currently not tracking blocked authors separately
      statsSnapshot: {
        totalVideosProcessed: totalItemsCount,
        totalBlocked: newDerivedCount,
        lastUpdated: new Date().toISOString(),
      },
    }

    if (newlyAdded > 0) {
      console.log(
        `\nAdded ${newlyAdded} new derived NG entries (${originalDerivedCount} → ${newDerivedCount})`,
      )
      console.log(
        'Derived NG data will be included in ranking data (no additional KV writes needed)',
      )
    } else {
      console.log('\nNo new derived NG entries found')
    }

    // Write to Cloudflare KV
    console.log('\nWriting ranking data to Cloudflare KV...')
    await writeRankingToCloudflareKVApi(rankingData)

    const duration = Date.now() - startTime
    console.log(
      `\nUpdate completed successfully in ${Math.round(duration / 1000)}s`,
    )
    console.log(`Total items: ${totalItemsCount}`)
    console.log(
      `Successful genres: ${successfulGenres.length}/${ALL_GENRES.length} - ${successfulGenres.join(', ')}`,
    )

    if (failedGenres.length > 0) {
      console.log(
        `Failed genres: ${failedGenres.length}/${ALL_GENRES.length} - ${failedGenres.join(', ')}`,
      )
      // Exit with error if any genres failed
      process.exit(1)
    }

    // Show time improvement
    console.log(
      `\n⚡ Improved parallel execution completed in approximately ${Math.round(duration / 60000)} minutes`,
    )
    const tagFetchStats = getTagFetchRunStats()
    await uploadTagFetchStatsToR2(tagFetchStats, { genres: ALL_GENRES })
  } catch (error) {
    console.error('Update failed:', error)
    process.exit(1)
  }
}

// Check if this is being run for a specific group (for GitHub Actions matrix)
if (process.argv[2] === '--group') {
  // Group mode for GitHub Actions matrix strategy
  const groupId = parseInt(process.argv[3])
  const totalGroups = parseInt(process.argv[4] || '8')

  if (!groupId || groupId < 1 || groupId > totalGroups) {
    console.error('Invalid group ID. Usage: --group <groupId> [totalGroups]')
    process.exit(1)
  }

  // Use custom groups for better load distribution
  let groupGenres: RankingGenre[]
  if (totalGroups === 8 && groupId <= CUSTOM_GROUPS.length) {
    // Use custom group definitions
    groupGenres = CUSTOM_GROUPS[groupId - 1] as RankingGenre[]
    console.log(
      `Using custom group ${groupId}/${totalGroups} with genres: ${groupGenres.join(', ')}`,
    )
  } else {
    // Fallback to mechanical division
    const genresPerGroup = Math.ceil(ALL_GENRES.length / totalGroups)
    const startIdx = (groupId - 1) * genresPerGroup
    const endIdx = Math.min(startIdx + genresPerGroup, ALL_GENRES.length)
    groupGenres = ALL_GENRES.slice(startIdx, endIdx)
    console.log(
      `Running mechanical group ${groupId}/${totalGroups} with genres: ${groupGenres.join(', ')}`,
    )
  }

  // Run only for this group and save partial results
  ;(async () => {
    const startTime = Date.now()
    resetTagFetchRunStats()
    const ngList = await getNGList()
    const originalDerivedCount = ngList.derivedVideoIds.length
    console.log(
      `Group ${groupId} NG list: ${ngList.videoIds.length} video IDs, ${ngList.videoTitles.exact.length + ngList.videoTitles.partial.length} titles, ${ngList.authorIds.length} author IDs, ${ngList.authorNames.exact.length + ngList.authorNames.partial.length} author names, ${ngList.derivedVideoIds.length} derived`,
    )

    // Process each genre sequentially within group
    const results = []
    for (const genre of groupGenres) {
      const result = await processGenre(genre, ngList)
      results.push(result)

      // Add delay between genres
      if (genre !== groupGenres[groupGenres.length - 1]) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    // Save partial results
    const tmpDir = './tmp'
    await fs.mkdir(tmpDir, { recursive: true })
    await fs.writeFile(
      path.join(tmpDir, `ranking-group-${groupId}.json`),
      JSON.stringify(results, null, 2),
    )

    // Check if new derived entries were found
    const newDerivedCount = ngList.derivedVideoIds.length
    if (newDerivedCount > originalDerivedCount) {
      const newlyAdded = newDerivedCount - originalDerivedCount
      console.log(
        `Group ${groupId} found ${newlyAdded} new derived NG entries (${originalDerivedCount} → ${newDerivedCount})`,
      )

      // Save the new derived entries for aggregation
      const derivedData = {
        originalCount: originalDerivedCount,
        newCount: newDerivedCount,
        newEntries: ngList.derivedVideoIds.slice(originalDerivedCount), // Only the new ones
        allEntries: ngList.derivedVideoIds, // Complete list for safety
      }

      await fs.writeFile(
        path.join(tmpDir, `ng-derived-group-${groupId}.json`),
        JSON.stringify(derivedData, null, 2),
      )

      console.log(
        `Saved ${newlyAdded} new derived entries to ng-derived-group-${groupId}.json`,
      )
    }

    const duration = Date.now() - startTime
    console.log(
      `Group ${groupId} completed in ${Math.round(duration / 1000)}s with ${results.length} genres`,
    )
    const tagFetchStats = getTagFetchRunStats()
    await uploadTagFetchStatsToR2(tagFetchStats, {
      groupId,
      totalGroups,
      genres: groupGenres,
    })

    // Exit with error if we didn't get all expected genres
    if (results.length !== groupGenres.length) {
      console.error(
        `ERROR: Expected ${groupGenres.length} genres but only processed ${results.length}`,
      )
      process.exit(1)
    }
  })().catch((error) => {
    console.error(`Group ${groupId} failed catastrophically:`, error)
    process.exit(1)
  })
} else {
  // Run if called directly (full parallel mode)
  main()
}
