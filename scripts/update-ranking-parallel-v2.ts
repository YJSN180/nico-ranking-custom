#!/usr/bin/env npx tsx
import 'dotenv/config'
import type { RankingGenre } from '../types/ranking-config'
import type { RankingItem } from '../types/ranking'
import { kv } from '../lib/simple-kv'
import fs from 'fs/promises'
import path from 'path'

// All 23 genres to fetch
const ALL_GENRES: RankingGenre[] = [
  'all', 'game', 'anime', 'vocaloid', 'voicesynthesis',
  'entertainment', 'music', 'sing', 'dance', 'play',
  'commentary', 'cooking', 'travel', 'nature', 'vehicle',
  'technology', 'society', 'mmd', 'vtuber', 'radio',
  'sports', 'animal', 'other'
];

// Genre ID mapping
const GENRE_ID_MAP: Record<RankingGenre, string> = {
  all: 'e9uj2uks',
  game: '4eet3ca4',
  anime: 'zc49b03a',
  vocaloid: 'dshv5do5',
  voicesynthesis: 'e2bi9pt8',
  entertainment: '8kjl94d9',
  music: 'wq76qdin',
  sing: '1ya6bnqd',
  dance: '6yuf530c',
  play: '6r5jr8nd',
  commentary: 'v6wdx6p5',
  cooking: 'lq8d5918',
  travel: 'k1libcse',
  nature: '24aa8fkw',
  vehicle: '3d8zlls9',
  technology: 'n46kcz9u',
  society: 'lzicx0y6',
  mmd: 'p1acxuoz',
  vtuber: '6mkdo4xd',
  radio: 'oxzi6bje',
  sports: '4w3p65pf',
  animal: 'ne72lua2',
  other: 'ramuboyn'
};

// NG list interface
interface NGList {
  videoIds: string[]
  videoTitles: string[]
  authorIds: string[]
  authorNames: string[]
  derivedVideoIds: string[]
}

// Helper to fetch with Googlebot UA
async function fetchWithGooglebot(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja',
      'Cookie': 'sensitive_material_status=accept'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText} for URL: ${url}`);
  }
  
  return response;
}

// Extract server-response data from HTML
function extractServerResponseData(html: string): any {
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/);
  if (!metaMatch || !metaMatch[1]) {
    throw new Error('server-responseメタタグが見つかりません');
  }
  
  const encodedData = metaMatch[1];
  const decodedData = encodedData
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
  
  return JSON.parse(decodedData);
}

// Extract trend tags from server response
function extractTrendTags(serverData: any): string[] {
  try {
    const trendTags = serverData.data?.response?.$getTeibanRankingFeaturedKeyAndTrendTags?.data?.trendTags;
    
    if (!Array.isArray(trendTags)) {
      return [];
    }
    
    return trendTags.filter((tag: any) => {
      return typeof tag === 'string' && tag.trim().length > 0;
    });
  } catch (error) {
    return [];
  }
}

// Convert thumbnail URL from .M to .L for higher resolution
function convertThumbnailUrl(url: string): string {
  return url.replace(/\.M$/, '.L');
}

// Get NG list from artifact file (CI) or Vercel KV (fallback)
async function getNGList(): Promise<NGList> {
  try {
    // Check if NG list is available from artifact (in CI environment)
    const ngListPath = './ng-list.json';
    try {
      await fs.access(ngListPath);
      console.log('Loading NG list from artifact file');
      const data = JSON.parse(await fs.readFile(ngListPath, 'utf-8'));
      return data;
    } catch {
      // File doesn't exist, continue to KV fetch
    }
    
    // Fallback to fetching from KV (for local development or manual runs)
    console.log('Fetching NG list from KV');
    const [manual, derived] = await Promise.all([
      kv.get<Omit<NGList, 'derivedVideoIds'>>('ng-list-manual'),
      kv.get<string[]>('ng-list-derived')
    ]);
    
    return {
      videoIds: manual?.videoIds || [],
      videoTitles: manual?.videoTitles || [],
      authorIds: manual?.authorIds || [],
      authorNames: manual?.authorNames || [],
      derivedVideoIds: derived || []
    };
  } catch (error) {
    console.error('Failed to fetch NG list:', error);
    return {
      videoIds: [],
      videoTitles: [],
      authorIds: [],
      authorNames: [],
      derivedVideoIds: []
    };
  }
}

// Filter items with NG list
function filterWithNGList(items: RankingItem[], ngList: NGList): RankingItem[] {
  const videoIdSet = new Set([...ngList.videoIds, ...ngList.derivedVideoIds]);
  const titleSet = new Set(ngList.videoTitles);
  const authorIdSet = new Set(ngList.authorIds);
  const authorNameSet = new Set(ngList.authorNames);
  
  return items.filter(item => {
    if (videoIdSet.has(item.id)) return false;
    if (titleSet.has(item.title)) return false;
    if (item.authorId && authorIdSet.has(item.authorId)) return false;
    if (item.authorName && authorNameSet.has(item.authorName)) return false;
    return true;
  });
}

// Fetch ranking page with retry logic
async function fetchRankingPageWithRetry(
  genre: RankingGenre,
  period: '24h' | 'hour',
  tag?: string,
  page: number = 1,
  maxRetries: number = 3
): Promise<{ items: RankingItem[], popularTags: string[] }> {
  const genreId = GENRE_ID_MAP[genre];
  let url = `https://www.nicovideo.jp/ranking/genre/${genreId}?term=${period}`;
  
  if (tag) {
    url += `&tag=${encodeURIComponent(tag)}`;
  }
  if (page > 1) {
    url += `&page=${page}`;
  }

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetchWithGooglebot(url);
      const html = await response.text();
      
      const serverData = extractServerResponseData(html);
      const rankingData = serverData.data?.response?.$getTeibanRanking?.data;
      
      if (!rankingData) {
        throw new Error('ランキングデータが見つかりません');
      }

      const popularTags = extractTrendTags(serverData);
      const startRank = (page - 1) * 100 + 1;
      const items: RankingItem[] = (rankingData.items || []).map((item: any, index: number) => ({
        rank: startRank + index,
        id: item.id,
        title: item.title,
        thumbURL: convertThumbnailUrl(item.thumbnail?.url || item.thumbnail?.middleUrl || ''),
        views: item.count?.view || 0,
        comments: item.count?.comment || 0,
        mylists: item.count?.mylist || 0,
        likes: item.count?.like || 0,
        tags: item.tags || [],
        authorId: item.owner?.id || item.user?.id,
        authorName: item.owner?.name || item.user?.nickname || item.channel?.name,
        authorIcon: item.owner?.iconUrl || item.user?.iconUrl || item.channel?.iconUrl,
        registeredAt: item.registeredAt || item.startTime || item.createTime
      }));

      return { items, popularTags };
      
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on 404 errors (no more pages)
      if (error.message && error.message.includes('404')) {
        throw error;
      }
      
      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff
        console.log(`Retry ${attempt + 1}/${maxRetries} for ${genre}/${period}/page${page} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Unknown error');
}

// Fetch with NG filtering
async function fetchWithNGFiltering(
  genre: RankingGenre,
  period: '24h' | 'hour',
  ngList: NGList,
  tag?: string,
  targetItems: number = 500
): Promise<{ items: RankingItem[], popularTags: string[] }> {
  const allItems: RankingItem[] = [];
  let popularTags: string[] = [];
  let page = 1;
  const maxPages = 10;
  
  while (allItems.length < targetItems && page <= maxPages) {
    try {
      const { items, popularTags: pageTags } = await fetchRankingPageWithRetry(genre, period, tag, page);
      
      if (page === 1 && pageTags.length > 0) {
        popularTags = pageTags;
      }

      const filteredItems = filterWithNGList(items, ngList);
      allItems.push(...filteredItems);

      if (items.length < 100) break;
      page++;

      if (page <= maxPages) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error: any) {
      // Check if it's a 404 error (no more pages available)
      if (error.message && error.message.includes('404')) {
        console.log(`Reached end of pages for ${genre}/${period} at page ${page} (404 - this is normal)`);
      } else {
        console.error(`Failed to fetch page ${page} for ${genre}/${period}:`, error);
      }
      // Break the loop regardless - we've gotten all available items
      break;
    }
  }

  const limitedItems = allItems.slice(0, targetItems).map((item, index) => ({
    ...item,
    rank: index + 1
  }));

  return { items: limitedItems, popularTags };
}

// Write to Cloudflare KV via REST API
async function writeToCloudflareKV(data: any): Promise<void> {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare KV credentials not configured");
  }

  // Dynamic import for pako
  const pako = await import('pako');
  const jsonString = JSON.stringify(data);
  const compressed = pako.gzip(jsonString);

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/octet-stream",
    },
    body: compressed,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloudflare KV write failed: ${response.status} - ${error}`);
  }

  // Set metadata
  const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/RANKING_LATEST`;
  
  await fetch(metadataUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      compressed: true,
      version: 1,
      updatedAt: new Date().toISOString(),
      size: compressed.length,
      ngFiltered: true,
    }),
  });
}

// Process single genre (both periods at once to share popular tags)
async function processGenre(
  genre: RankingGenre,
  ngList: NGList
): Promise<{
  genre: RankingGenre,
  data: {
    '24h': {
      items: RankingItem[],
      popularTags: string[],
      tags: Record<string, RankingItem[]>
    },
    'hour': {
      items: RankingItem[],
      popularTags: string[],
      tags: Record<string, RankingItem[]>
    }
  }
}> {
  console.log(`[${new Date().toISOString()}] Starting ${genre}...`);
  
  // Fetch main rankings for both periods independently to handle errors separately
  let data24h = { items: [], popularTags: [] };
  let dataHour = { items: [], popularTags: [] };
  let popularTags: string[] = [];
  
  // Try to fetch 24h data
  try {
    data24h = await fetchWithNGFiltering(genre, '24h', ngList, undefined, 1000);
    popularTags = data24h.popularTags;
  } catch (error) {
    console.error(`Failed to fetch ${genre}/24h:`, error);
    // Continue with empty data for 24h
  }
  
  // Add delay between requests to the same genre endpoint
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Try to fetch hour data
  try {
    dataHour = await fetchWithNGFiltering(genre, 'hour', ngList, undefined, 1000);
    // If we didn't get popular tags from 24h, try from hour
    if (popularTags.length === 0) {
      popularTags = dataHour.popularTags;
    }
  } catch (error) {
    console.error(`Failed to fetch ${genre}/hour:`, error);
    // Continue with empty data for hour
  }
  
  // Prepare result structure
  const result = {
    genre,
    data: {
      '24h': {
        items: data24h.items,
        popularTags: popularTags,
        tags: {} as Record<string, RankingItem[]>
      },
      'hour': {
        items: dataHour.items,
        popularTags: popularTags, // Same tags
        tags: {} as Record<string, RankingItem[]>
      }
    }
  };
  
  // Fetch tag rankings for BOTH periods (but same set of tags)
  if (popularTags.length > 0) {
    // Process tags sequentially with delay to avoid rate limiting
    for (const tag of popularTags) {
      // 24h version
      try {
        console.log(`[${new Date().toISOString()}] Fetching tag ${genre}/24h/${tag}...`);
        const { items: tagItems } = await fetchWithNGFiltering(genre, '24h', ngList, tag, 300);
        result.data['24h'].tags[tag] = tagItems;
      } catch (error) {
        console.error(`Failed to fetch tag ranking for ${genre}/24h/${tag}:`, error);
        result.data['24h'].tags[tag] = [];
      }
      
      await new Promise(resolve => setTimeout(resolve, 500)); // Delay between tag fetches
      
      // hour version
      try {
        console.log(`[${new Date().toISOString()}] Fetching tag ${genre}/hour/${tag}...`);
        const { items: tagItems } = await fetchWithNGFiltering(genre, 'hour', ngList, tag, 300);
        result.data['hour'].tags[tag] = tagItems;
      } catch (error) {
        console.error(`Failed to fetch tag ranking for ${genre}/hour/${tag}:`, error);
        result.data['hour'].tags[tag] = [];
      }
      
      await new Promise(resolve => setTimeout(resolve, 500)); // Delay between tag fetches
    }
  }
  
  console.log(`[${new Date().toISOString()}] Completed ${genre} (24h: ${data24h.items.length} items, hour: ${dataHour.items.length} items, ${popularTags.length} tags)`);
  
  return result;
}

// Main function for parallel execution
async function main() {
  const startTime = Date.now();
  
  try {
    console.log('Starting improved parallel ranking update...');
    console.log(`Processing ${ALL_GENRES.length} genres × 2 periods = ${ALL_GENRES.length * 2} combinations`);
    
    // Get NG list
    const ngList = await getNGList();
    console.log(`NG list loaded: ${ngList.videoIds.length} video IDs, ${ngList.videoTitles.length} titles, ${ngList.authorIds.length} authors, ${ngList.derivedVideoIds.length} derived`);

    // Build final data structure
    const rankingData: any = {
      genres: {},
      metadata: {
        version: 1,
        updatedAt: new Date().toISOString(),
        totalItems: 0,
        ngFiltered: true
      }
    };
    
    let totalItemsCount = 0;
    const successfulGenres: string[] = [];
    const failedGenres: string[] = [];
    
    // Process genres in batches to avoid overloading
    const batchSize = 4; // Process 4 genres concurrently
    const batches: RankingGenre[][] = [];
    
    for (let i = 0; i < ALL_GENRES.length; i += batchSize) {
      batches.push(ALL_GENRES.slice(i, i + batchSize));
    }
    
    console.log(`Processing ${batches.length} batches of up to ${batchSize} genres each`);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`\nProcessing batch ${batchIndex + 1}/${batches.length}: ${batch.join(', ')}`);
      
      // Process batch concurrently
      const batchPromises = batch.map(genre => processGenre(genre, ngList));
      const batchResults = await Promise.all(batchPromises);
      
      // Add results to ranking data
      for (const result of batchResults) {
        rankingData.genres[result.genre] = result.data;
        
        // Check if genre has data (not failed)
        if (result.data['24h'].items.length > 0 || result.data['hour'].items.length > 0) {
          successfulGenres.push(result.genre);
        } else {
          failedGenres.push(result.genre);
        }
        
        // Count items
        totalItemsCount += result.data['24h'].items.length;
        totalItemsCount += result.data['hour'].items.length;
        
        for (const tagItems of Object.values(result.data['24h'].tags)) {
          totalItemsCount += (tagItems as RankingItem[]).length;
        }
        for (const tagItems of Object.values(result.data['hour'].tags)) {
          totalItemsCount += (tagItems as RankingItem[]).length;
        }
      }
      
      // Add delay between batches
      if (batchIndex < batches.length - 1) {
        console.log('Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    rankingData.metadata.totalItems = totalItemsCount;

    // Write to Cloudflare KV
    console.log('\nWriting to Cloudflare KV...');
    await writeToCloudflareKV(rankingData);

    const duration = Date.now() - startTime;
    console.log(`\nUpdate completed successfully in ${Math.round(duration / 1000)}s`);
    console.log(`Total items: ${totalItemsCount}`);
    console.log(`Successful genres: ${successfulGenres.length}/${ALL_GENRES.length} - ${successfulGenres.join(', ')}`);
    
    if (failedGenres.length > 0) {
      console.log(`Failed genres: ${failedGenres.length}/${ALL_GENRES.length} - ${failedGenres.join(', ')}`);
      // Exit with error if any genres failed
      process.exit(1);
    }
    
    // Show time improvement
    console.log(`\n⚡ Improved parallel execution completed in approximately ${Math.round(duration / 60000)} minutes`);
  } catch (error) {
    console.error('Update failed:', error);
    process.exit(1);
  }
}

// Check if this is being run for a specific group (for GitHub Actions matrix)
if (process.argv[2] === '--group') {
  // Group mode for GitHub Actions matrix strategy
  const groupId = parseInt(process.argv[3]);
  const totalGroups = parseInt(process.argv[4] || '6');
  
  if (!groupId || groupId < 1 || groupId > totalGroups) {
    console.error('Invalid group ID. Usage: --group <groupId> [totalGroups]');
    process.exit(1);
  }
  
  // Divide genres among groups
  const genresPerGroup = Math.ceil(ALL_GENRES.length / totalGroups);
  const startIdx = (groupId - 1) * genresPerGroup;
  const endIdx = Math.min(startIdx + genresPerGroup, ALL_GENRES.length);
  const groupGenres = ALL_GENRES.slice(startIdx, endIdx);
  
  console.log(`Running group ${groupId}/${totalGroups} with genres: ${groupGenres.join(', ')}`);
  
  // Run only for this group and save partial results
  (async () => {
    const startTime = Date.now();
    const ngList = await getNGList();
    
    // Process each genre sequentially within group
    const results = [];
    for (const genre of groupGenres) {
      const result = await processGenre(genre, ngList);
      results.push(result);
      
      // Add delay between genres
      if (genre !== groupGenres[groupGenres.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Save partial results
    const tmpDir = './tmp';
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, `ranking-group-${groupId}.json`),
      JSON.stringify(results, null, 2)
    );
    
    const duration = Date.now() - startTime;
    console.log(`Group ${groupId} completed in ${Math.round(duration / 1000)}s with ${results.length} genres`);
    
    // Exit with error if we didn't get all expected genres
    if (results.length !== groupGenres.length) {
      console.error(`ERROR: Expected ${groupGenres.length} genres but only processed ${results.length}`);
      process.exit(1);
    }
  })().catch(error => {
    console.error(`Group ${groupId} failed catastrophically:`, error);
    process.exit(1);
  });
} else {
  // Run if called directly (full parallel mode)
  if (require.main === module) {
    main();
  }
}