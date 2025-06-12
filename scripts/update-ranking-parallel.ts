#!/usr/bin/env npx tsx
import 'dotenv/config'
import type { RankingGenre } from '../types/ranking-config'
import type { RankingItem } from '../types/ranking'
import { kv } from '../lib/simple-kv'
import fs from 'fs/promises'
import path from 'path'

// All 23 genres to fetch - EXACTLY THE SAME AS ORIGINAL
const ALL_GENRES: RankingGenre[] = [
  'all', 'game', 'anime', 'vocaloid', 'voicesynthesis',
  'entertainment', 'music', 'sing', 'dance', 'play',
  'commentary', 'cooking', 'travel', 'nature', 'vehicle',
  'technology', 'society', 'mmd', 'vtuber', 'radio',
  'sports', 'animal', 'other'
];

// Genre ID mapping - EXACTLY THE SAME AS ORIGINAL
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

// NG list interface - EXACTLY THE SAME AS ORIGINAL
interface NGList {
  videoIds: string[]
  videoTitles: string[]
  authorIds: string[]
  authorNames: string[]
  derivedVideoIds: string[]
}

// Helper to fetch with Googlebot UA - EXACTLY THE SAME AS ORIGINAL
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
    throw new Error(`Fetch failed: ${response.status}`);
  }
  
  return response;
}

// Extract server-response data from HTML - EXACTLY THE SAME AS ORIGINAL
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

// Extract trend tags from server response - EXACTLY THE SAME AS ORIGINAL
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

// Convert thumbnail URL from .M to .L for higher resolution - EXACTLY THE SAME AS ORIGINAL
function convertThumbnailUrl(url: string): string {
  return url.replace(/\.M$/, '.L');
}

// Get NG list from Vercel KV - EXACTLY THE SAME AS ORIGINAL
async function getNGList(): Promise<NGList> {
  try {
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

// Filter items with NG list - EXACTLY THE SAME AS ORIGINAL
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

// Fetch ranking page - EXACTLY THE SAME AS ORIGINAL
async function fetchRankingPage(
  genre: RankingGenre,
  period: '24h' | 'hour',
  tag?: string,
  page: number = 1
): Promise<{ items: RankingItem[], popularTags: string[] }> {
  const genreId = GENRE_ID_MAP[genre];
  let url = `https://www.nicovideo.jp/ranking/genre/${genreId}?term=${period}`;
  
  if (tag) {
    url += `&tag=${encodeURIComponent(tag)}`;
  }
  if (page > 1) {
    url += `&page=${page}`;
  }

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
}

// Fetch with NG filtering - EXACTLY THE SAME AS ORIGINAL
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
      const { items, popularTags: pageTags } = await fetchRankingPage(genre, period, tag, page);
      
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
    } catch (error) {
      console.error(`Failed to fetch page ${page} for ${genre}/${period}:`, error);
      break;
    }
  }

  const limitedItems = allItems.slice(0, targetItems).map((item, index) => ({
    ...item,
    rank: index + 1
  }));

  return { items: limitedItems, popularTags };
}

// Write to Cloudflare KV via REST API - EXACTLY THE SAME AS ORIGINAL
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

// Parallel execution helper
async function executeInParallel<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrency: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];
  
  for (const task of tasks) {
    const promise = task().then(result => {
      results.push(result);
    });
    
    executing.push(promise);
    
    if (executing.length >= maxConcurrency) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(p => p === promise), 1);
    }
  }
  
  await Promise.all(executing);
  return results;
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
  
  // Fetch main rankings for both periods
  const [data24h, dataHour] = await Promise.all([
    fetchWithNGFiltering(genre, '24h', ngList),
    fetchWithNGFiltering(genre, 'hour', ngList)
  ]);
  
  // Popular tags are the same for both periods, so use from 24h
  const popularTags = data24h.popularTags;
  
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
    const tagTasks: (() => Promise<{ tag: string, period: '24h' | 'hour', items: RankingItem[] }>)[] = [];
    
    // Create tasks for each tag × period combination
    for (const tag of popularTags) {
      // 24h version
      tagTasks.push(async () => {
        try {
          console.log(`[${new Date().toISOString()}] Fetching tag ${genre}/24h/${tag}...`);
          const { items: tagItems } = await fetchWithNGFiltering(genre, '24h', ngList, tag);
          return { tag, period: '24h' as const, items: tagItems };
        } catch (error) {
          console.error(`Failed to fetch tag ranking for ${genre}/24h/${tag}:`, error);
          return { tag, period: '24h' as const, items: [] };
        }
      });
      
      // hour version
      tagTasks.push(async () => {
        try {
          console.log(`[${new Date().toISOString()}] Fetching tag ${genre}/hour/${tag}...`);
          const { items: tagItems } = await fetchWithNGFiltering(genre, 'hour', ngList, tag);
          return { tag, period: 'hour' as const, items: tagItems };
        } catch (error) {
          console.error(`Failed to fetch tag ranking for ${genre}/hour/${tag}:`, error);
          return { tag, period: 'hour' as const, items: [] };
        }
      });
    }
    
    // Execute tag fetches with limited concurrency to respect rate limits
    const tagResults = await executeInParallel(tagTasks, 3); // 3 concurrent tag fetches
    
    // Organize results by period
    for (const { tag, period, items } of tagResults) {
      result.data[period].tags[tag] = items;
    }
  }
  
  console.log(`[${new Date().toISOString()}] Completed ${genre} (24h: ${data24h.items.length} items, hour: ${dataHour.items.length} items, ${popularTags.length} tags)`);
  
  return result;
}

// Main function for parallel execution
async function main() {
  const startTime = Date.now();
  
  try {
    console.log('Starting parallel ranking update...');
    console.log(`Processing ${ALL_GENRES.length} genres × 2 periods = ${ALL_GENRES.length * 2} combinations`);
    
    // Get NG list
    const ngList = await getNGList();
    console.log(`NG list loaded: ${ngList.videoIds.length} video IDs, ${ngList.videoTitles.length} titles`);

    // Create tasks for all genres (processing both periods at once)
    const tasks: (() => Promise<any>)[] = [];
    
    for (const genre of ALL_GENRES) {
      tasks.push(() => processGenre(genre, ngList));
    }
    
    // Execute in parallel with concurrency limit
    console.log(`Executing ${tasks.length} genre tasks with concurrency limit of 6...`);
    const results = await executeInParallel(tasks, 6); // 6 concurrent genre fetches
    
    // Build final data structure - EXACTLY THE SAME AS ORIGINAL
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
    
    // Organize results into the same structure as original
    for (const result of results) {
      rankingData.genres[result.genre] = result.data;
      
      // Count items - EXACTLY THE SAME AS ORIGINAL
      totalItemsCount += result.data['24h'].items.length;
      totalItemsCount += result.data['hour'].items.length;
      
      for (const tagItems of Object.values(result.data['24h'].tags)) {
        totalItemsCount += (tagItems as RankingItem[]).length;
      }
      for (const tagItems of Object.values(result.data['hour'].tags)) {
        totalItemsCount += (tagItems as RankingItem[]).length;
      }
    }
    
    rankingData.metadata.totalItems = totalItemsCount;

    // Write to Cloudflare KV - EXACTLY THE SAME AS ORIGINAL
    console.log('Writing to Cloudflare KV...');
    await writeToCloudflareKV(rankingData);

    const duration = Date.now() - startTime;
    console.log(`Update completed successfully in ${Math.round(duration / 1000)}s`);
    console.log(`Total items: ${totalItemsCount}`);
    
    // Show time improvement
    console.log(`\n⚡ Parallel execution reduced time by approximately ${Math.round((1 - (duration / (18 * 60 * 1000))) * 100)}%`);
  } catch (error) {
    console.error('Update failed:', error);
    process.exit(1);
  }
}

// Check if this is being run for a specific group (for GitHub Actions matrix)
if (process.argv[2] === '--group') {
  // Group mode for GitHub Actions matrix strategy
  const groupId = parseInt(process.argv[3]);
  const totalGroups = parseInt(process.argv[4] || '8');
  
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
    
    // Process each genre (both periods at once)
    const tasks = groupGenres.map(genre => () => processGenre(genre, ngList));
    
    const results = await executeInParallel(tasks, 2); // Lower concurrency per group
    
    // Save partial results
    const tmpDir = './tmp';
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, `ranking-group-${groupId}.json`),
      JSON.stringify(results)
    );
    
    const duration = Date.now() - startTime;
    console.log(`Group ${groupId} completed in ${Math.round(duration / 1000)}s`);
  })().catch(error => {
    console.error(`Group ${groupId} failed:`, error);
    process.exit(1);
  });
} else {
  // Run if called directly (full parallel mode)
  if (require.main === module) {
    main();
  }
}