import { 
  extractUniqueVideoIds, 
  buildSnapshotAPIUrl, 
  processSnapshotResponse,
  batchArray 
} from './utils.js';
import { compressData } from './compression.js';

// Constants
const STATS_KEY = 'VIDEO_STATS_LATEST';
const BATCH_SIZE = 50; // Snapshot API batch size

/**
 * Fetch ranking metadata from R2
 * @param {R2Bucket} r2Bucket - R2 bucket binding
 * @returns {Promise<Object>} Ranking metadata
 */
async function fetchRankingMetadata(r2Bucket) {
  const metadataObject = await r2Bucket.get('rankings/metadata.json');
  
  if (!metadataObject) {
    console.warn('No metadata found, using defaults');
    return {
      genres: ['all', 'game', 'anime', 'vocaloid', 'entertainment', 'music'],
      periods: ['24h', 'hour'],
      tagsByGenrePeriod: {}
    };
  }
  
  const metadataText = await metadataObject.text();
  const metadata = JSON.parse(metadataText);
  
  // Extract genres and periods from tagsByGenrePeriod
  const genrePeriodPairs = Object.keys(metadata.tagsByGenrePeriod || {});
  const genres = new Set();
  const periods = new Set();
  
  genrePeriodPairs.forEach(pair => {
    const [genre, period] = pair.split('/');
    if (genre) genres.add(genre);
    if (period) periods.add(period);
  });
  
  return {
    ...metadata,
    genres: Array.from(genres),
    periods: Array.from(periods)
  };
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
  
  // Fetch data for each genre/period combination
  const fetchPromises = [];
  
  for (const genre of metadata.genres) {
    rankingData.genres[genre] = {};
    
    for (const period of metadata.periods) {
      fetchPromises.push(
        (async () => {
          try {
            // New path format: rankings/{genre}/{period}/all.json
            const dataObject = await r2Bucket.get(`rankings/${genre}/${period}/all.json`);
            
            if (dataObject) {
              const dataText = await dataObject.text();
              const data = JSON.parse(dataText);
              
              if (!rankingData.genres[genre][period]) {
                rankingData.genres[genre][period] = {};
              }
              
              rankingData.genres[genre][period] = {
                items: data.items || [],
                popularTags: data.popularTags || [],
                metadata: data.metadata
              };
              
              console.log(`Loaded ${data.items?.length || 0} items for ${genre}/${period}`);
            }
          } catch (error) {
            console.warn(`Failed to fetch data for ${genre}/${period}:`, error);
          }
        })()
      );
    }
  }
  
  await Promise.all(fetchPromises);
  
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
 * Main scheduled handler for the Worker
 */
export default {
  async scheduled(controller, env, ctx) {
    console.log('Starting video stats update...');
    
    try {
      // 1. Fetch ranking metadata from R2
      const metadata = await fetchRankingMetadata(env.R2_BUCKET);
      
      // 2. Fetch all ranking data from R2
      const rankingData = await fetchRankingData(env.R2_BUCKET, metadata);
      
      // 3. Extract unique video IDs
      const videoIds = extractUniqueVideoIds(rankingData);
      console.log(`Found ${videoIds.length} unique videos to update`);
      
      // 4. Prepare stats data structure
      let statsData;
      
      if (videoIds.length === 0) {
        // No videos found, create empty stats
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
      
      console.log(`Successfully updated stats for ${statsData.metadata.totalVideos} videos`);
    } catch (error) {
      console.error('Failed to update video stats:', error);
      
      // Re-throw with appropriate error message
      if (error.message.includes('metadata')) {
        throw new Error('Failed to fetch ranking metadata');
      } else if (error.message.includes('API')) {
        throw new Error('Failed to fetch video stats');
      } else {
        throw error;
      }
    }
  },
};