import { 
  extractUniqueVideoIds, 
  buildSnapshotAPIUrl, 
  processSnapshotResponse,
  batchArray 
} from './utils.js';
import {
  Sentry,
  captureWorkerException,
  captureWorkerLog,
  createWorkerSentryOptions,
} from '../../sentry.js';

// Constants
const STATS_KEY = 'VIDEO_STATS_LATEST';
const BATCH_SIZE = 50; // Snapshot API batch size

// Default metadata when not found in R2
const DEFAULT_METADATA = {
  genres: ['all', 'game', 'anime', 'vocaloid', 'entertainment', 'music'],
  periods: ['24h', 'hour'],
  tagsByGenrePeriod: {},
  version: 1,
  updatedAt: new Date().toISOString()
};

function isGzipBytes(bytes) {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function decompressGzipBytes(bytes) {
  return new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  ).text();
}

async function parseR2Json(r2Object) {
  const bytes = new Uint8Array(await r2Object.arrayBuffer());
  const contentEncoding = r2Object.httpMetadata?.contentEncoding;
  const shouldDecompress = contentEncoding === 'gzip' || isGzipBytes(bytes);

  const text = shouldDecompress
    ? await decompressGzipBytes(bytes)
    : new TextDecoder().decode(bytes);

  return JSON.parse(text);
}

/**
 * Fetch ranking metadata from R2
 * @param {R2Bucket} r2Bucket - R2 bucket binding
 * @returns {Promise<Object>} Ranking metadata
 */
async function fetchRankingMetadata(r2Bucket) {
  try {
    const metadataObject = await r2Bucket.get('rankings/metadata.json');
    
    if (!metadataObject) {
      console.warn('No metadata found in R2, using defaults');
      return DEFAULT_METADATA;
    }
    
    const metadata = await parseR2Json(metadataObject);
    
    // Extract genres and periods from tagsByGenrePeriod or use directly
    let genres = metadata.genres || [];
    let periods = metadata.periods || [];
    
    // If genres/periods are not directly provided, extract from tagsByGenrePeriod
    if ((!genres.length || !periods.length) && metadata.tagsByGenrePeriod) {
      const genrePeriodPairs = Object.keys(metadata.tagsByGenrePeriod);
      const genreSet = new Set();
      const periodSet = new Set();
      
      genrePeriodPairs.forEach(pair => {
        const [genre, period] = pair.split('/');
        if (genre) genreSet.add(genre);
        if (period) periodSet.add(period);
      });
      
      if (!genres.length) genres = Array.from(genreSet);
      if (!periods.length) periods = Array.from(periodSet);
    }
    
    // Use defaults if still empty
    if (!genres.length) genres = DEFAULT_METADATA.genres;
    if (!periods.length) periods = DEFAULT_METADATA.periods;
    
    return {
      ...metadata,
      genres,
      periods
    };
  } catch (error) {
    console.error('Error fetching metadata:', error);
    captureWorkerLog('error', 'video_stats_updater.r2_metadata_failed', {
      attributes: {
        runtime: 'cloudflare-worker',
        surface: 'video-stats-updater',
        endpoint_family: 'scheduled',
        upstream_kind: 'r2-metadata',
        worker_version: 'video-stats-updater',
      },
    });
    captureWorkerException(error, {
      tags: {
        runtime: 'cloudflare-worker',
        surface: 'video-stats-updater',
        endpoint_family: 'scheduled',
        upstream_kind: 'r2-metadata',
        worker_version: 'video-stats-updater',
      },
    });
    return DEFAULT_METADATA;
  }
}

/**
 * List R2 objects to find available ranking files
 * @param {R2Bucket} r2Bucket - R2 bucket binding
 * @returns {Promise<Object>} Available genres and periods
 */
async function discoverAvailableData(r2Bucket) {
  try {
    console.log('Discovering available data in R2...');
    
    // List objects with rankings/ prefix
    const list = await r2Bucket.list({
      prefix: 'rankings/',
      limit: 1000
    });
    
    const genres = new Set();
    const periods = new Set();
    const availablePaths = [];
    
    for (const object of list.objects) {
      // Parse path like rankings/all/24h/all.json
      const parts = object.key.split('/');
      if (parts.length >= 4 && parts[3] === 'all.json') {
        const genre = parts[1];
        const period = parts[2];
        genres.add(genre);
        periods.add(period);
        availablePaths.push(object.key);
      }
    }
    
    console.log(`Found ${genres.size} genres: ${Array.from(genres).join(', ')}`);
    console.log(`Found ${periods.size} periods: ${Array.from(periods).join(', ')}`);
    console.log(`Total paths found: ${availablePaths.length}`);
    
    return {
      genres: Array.from(genres),
      periods: Array.from(periods),
      availablePaths
    };
  } catch (error) {
    console.error('Error discovering data:', error);
    captureWorkerException(error, {
      tags: {
        runtime: 'cloudflare-worker',
        surface: 'video-stats-updater',
        endpoint_family: 'scheduled',
        upstream_kind: 'r2-list',
        worker_version: 'video-stats-updater',
      },
    });
    return {
      genres: DEFAULT_METADATA.genres,
      periods: DEFAULT_METADATA.periods,
      availablePaths: []
    };
  }
}

/**
 * Fetch all ranking data from R2
 * @param {R2Bucket} r2Bucket - R2 bucket binding
 * @param {Object} metadata - Ranking metadata
 * @returns {Promise<Object>} Complete ranking data
 */
async function fetchRankingData(r2Bucket, metadata) {
  const rankingData = {
    genres: {},
    metadata: {
      version: metadata.version || 1,
      updatedAt: metadata.updatedAt || new Date().toISOString()
    },
  };
  
  // First, try to discover what's actually available
  const discovered = await discoverAvailableData(r2Bucket);
  const genresToFetch = discovered.genres.length > 0 ? discovered.genres : metadata.genres;
  const periodsToFetch = discovered.periods.length > 0 ? discovered.periods : metadata.periods;
  
  // Fetch data for each genre/period combination
  const fetchPromises = [];
  
  for (const genre of genresToFetch) {
    rankingData.genres[genre] = {};
    
    for (const period of periodsToFetch) {
      fetchPromises.push(
        (async () => {
          try {
            // New path format: rankings/{genre}/{period}/all.json
            const r2Key = `rankings/${genre}/${period}/all.json`;
            console.log(`Attempting to fetch: ${r2Key}`);
            
            const dataObject = await r2Bucket.get(r2Key);
            
            if (dataObject) {
              const data = await parseR2Json(dataObject);
              
              if (!rankingData.genres[genre][period]) {
                rankingData.genres[genre][period] = {};
              }
              
              rankingData.genres[genre][period] = {
                items: data.items || [],
                popularTags: data.popularTags || [],
                metadata: data.metadata
              };
              
              console.log(`✓ Loaded ${data.items?.length || 0} items for ${genre}/${period}`);
            } else {
              console.log(`✗ No data found for ${genre}/${period}`);
            }
          } catch (error) {
            console.warn(`Failed to fetch data for ${genre}/${period}:`, error.message);
            captureWorkerLog('warn', 'video_stats_updater.r2_ranking_load_failed', {
              attributes: {
                runtime: 'cloudflare-worker',
                surface: 'video-stats-updater',
                endpoint_family: 'scheduled',
                upstream_kind: 'r2-ranking',
                worker_version: 'video-stats-updater',
                genre,
                period,
              },
            });
            captureWorkerException(error, {
              tags: {
                runtime: 'cloudflare-worker',
                surface: 'video-stats-updater',
                endpoint_family: 'scheduled',
                upstream_kind: 'r2-ranking',
                worker_version: 'video-stats-updater',
                genre,
                period,
              },
            });
          }
        })()
      );
    }
  }
  
  await Promise.all(fetchPromises);
  
  // Log summary
  let totalItems = 0;
  for (const genre of Object.keys(rankingData.genres)) {
    for (const period of Object.keys(rankingData.genres[genre])) {
      totalItems += rankingData.genres[genre][period]?.items?.length || 0;
    }
  }
  console.log(`Total ranking items loaded: ${totalItems}`);
  
  return rankingData;
}

/**
 * Fetch video stats from Snapshot API
 * @param {string[]} videoIds - Array of video IDs
 * @param {string} apiKey - Snapshot API key
 * @returns {Promise<Object>} Video stats indexed by video ID
 */
async function fetchVideoStats(videoIds, apiKey) {
  if (videoIds.length === 0) {
    return {};
  }
  
  const allStats = {};
  const batches = batchArray(videoIds, BATCH_SIZE);
  
  console.log(`Fetching stats for ${videoIds.length} videos in ${batches.length} batches`);
  
  // Process batches in parallel
  const batchPromises = batches.map(async (batch, index) => {
    try {
      const url = buildSnapshotAPIUrl(batch);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'application/json',
          'Accept-Language': 'ja'
        },
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const batchStats = processSnapshotResponse(data);
      
      console.log(`Batch ${index + 1}/${batches.length}: fetched ${Object.keys(batchStats).length} videos`);
      
      return batchStats;
    } catch (error) {
      console.error(`Failed to fetch batch ${index + 1}:`, error);
      captureWorkerException(error, {
        tags: {
          runtime: 'cloudflare-worker',
          surface: 'video-stats-updater',
          endpoint_family: 'scheduled',
          upstream_kind: 'snapshot-api',
          worker_version: 'video-stats-updater',
        },
        contexts: {
          batch: {
            batchIndex: index + 1,
            batchSize: batch.length,
          },
        },
      });
      return {};
    }
  });
  
  // Merge all batch results
  const batchResults = await Promise.all(batchPromises);
  batchResults.forEach(batchStats => {
    Object.assign(allStats, batchStats);
  });
  
  return allStats;
}

/**
 * Process video stats update logic
 */
async function processVideoStatsUpdate(env) {
  console.log('=== Starting video stats update ===');
  console.log(`Time: ${new Date().toISOString()}`);
  
  try {
      // 1. Fetch ranking metadata from R2
      const metadata = await fetchRankingMetadata(env.R2_BUCKET);
      console.log(`Using metadata - Genres: ${metadata.genres.join(', ')}, Periods: ${metadata.periods.join(', ')}`);
      
      // 2. Fetch all ranking data from R2
      const rankingData = await fetchRankingData(env.R2_BUCKET, metadata);
      
      // 3. Extract unique video IDs
      const videoIds = extractUniqueVideoIds(rankingData);
      console.log(`Found ${videoIds.length} unique videos to update`);
      
      // 4. Prepare stats data structure
      let statsData;
      
      if (videoIds.length === 0) {
        // No videos found, create empty stats
        console.warn('No videos found in ranking data');
        captureWorkerLog('warn', 'video_stats_updater.no_videos_found', {
          attributes: {
            runtime: 'cloudflare-worker',
            surface: 'video-stats-updater',
            endpoint_family: 'scheduled',
            upstream_kind: 'ranking-data',
            worker_version: 'video-stats-updater',
          },
        });
        statsData = {
          stats: {},
          metadata: {
            version: 1,
            updatedAt: new Date().toISOString(),
            totalVideos: 0,
          },
        };
      } else {
        // 5. Fetch video stats from Snapshot API
        const videoStats = await fetchVideoStats(videoIds, env.SNAPSHOT_API_KEY);
        
        // 6. Create stats data structure
        statsData = {
          stats: videoStats,
          metadata: {
            version: 1,
            updatedAt: new Date().toISOString(),
            totalVideos: Object.keys(videoStats).length,
          },
        };
      }
      
      // 7. Write to KV
      await env.STATS_KV.put(STATS_KEY, JSON.stringify(statsData));
      
      console.log(`✓ Successfully updated stats for ${statsData.metadata.totalVideos} videos`);
      console.log('=== Video stats update completed ===');
      
      return {
        success: true,
        totalVideos: statsData.metadata.totalVideos,
        updatedAt: statsData.metadata.updatedAt
      };
    } catch (error) {
      console.error('Failed to update video stats:', error);
      console.error('Stack trace:', error.stack);
      captureWorkerLog('error', 'video_stats_updater.stats_update_failed', {
        attributes: {
          runtime: 'cloudflare-worker',
          surface: 'video-stats-updater',
          endpoint_family: 'scheduled',
          upstream_kind: 'stats-update',
          worker_version: 'video-stats-updater',
        },
      });
      captureWorkerException(error, {
        tags: {
          runtime: 'cloudflare-worker',
          surface: 'video-stats-updater',
          endpoint_family: 'scheduled',
          upstream_kind: 'stats-update',
          worker_version: 'video-stats-updater',
        },
      });
      
      // Write error state to KV
      const errorData = {
        stats: {},
        metadata: {
          version: 1,
          updatedAt: new Date().toISOString(),
          totalVideos: 0,
          error: error.message
        }
      };
      
      try {
        await env.STATS_KV.put(STATS_KEY, JSON.stringify(errorData));
      } catch (kvError) {
        console.error('Failed to write error state to KV:', kvError);
        captureWorkerException(kvError, {
          tags: {
            runtime: 'cloudflare-worker',
            surface: 'video-stats-updater',
            endpoint_family: 'scheduled',
            upstream_kind: 'kv-write',
            worker_version: 'video-stats-updater',
          },
        });
      }
      
      // Re-throw with appropriate error message
      if (error.message.includes('metadata')) {
        throw new Error('Failed to fetch ranking metadata');
      } else if (error.message.includes('API')) {
        throw new Error('Failed to fetch video stats');
      } else {
        throw error;
      }
    }
}

/**
 * Main Worker export
 */
const handler = {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      Sentry.withMonitor(
        'video-stats-updater',
        () => processVideoStatsUpdate(env),
        {
          schedule: {
            type: 'crontab',
            value: '*/5 * * * *',
          },
          timezone: 'Asia/Tokyo',
          checkinMargin: 2,
          maxRuntime: 10,
        },
      ),
    );
  },
  
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    
    // Manual trigger endpoint with auth
    if (url.pathname === '/trigger' && request.method === 'POST') {
      // Check authorization
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || authHeader !== `Bearer ${env.WORKER_AUTH_KEY}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      
      try {
        const result = await processVideoStatsUpdate(env);
        return Response.json(result);
      } catch (error) {
        captureWorkerException(error, {
          tags: {
            runtime: 'cloudflare-worker',
            surface: 'video-stats-updater',
            endpoint_family: '/trigger',
            upstream_kind: 'manual-trigger',
            worker_version: 'video-stats-updater',
          },
        });
        return Response.json({ error: error.message }, { status: 500 });
      }
    }
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', time: new Date().toISOString() });
    }
    
    return new Response('Not Found', { status: 404 });
  },
};

export default Sentry.withSentry((env) => createWorkerSentryOptions(env), handler);
