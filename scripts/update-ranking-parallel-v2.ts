#!/usr/bin/env npx tsx
import type { RankingGenre } from '../types/ranking-config'
import { GENRE_GROUPS } from '../types/ranking-config'
import type { RankingItem } from '../types/ranking'
import { kv } from '../lib/simple-kv'
import { enrichRankingItemsWithTagDetails } from '../lib/tag-fetcher-hybrid'
import { GENRE_ID_MAP as STATIC_GENRE_ID_MAP } from '../lib/genre-mapping'
import * as fs from 'fs/promises'
import * as path from 'path'

// All 23 genres to fetch
const ALL_GENRES: RankingGenre[] = [
  'all', 'game', 'anime', 'vocaloid', 'voicesynthesis',
  'entertainment', 'music', 'sing', 'dance', 'play',
  'commentary', 'cooking', 'travel', 'nature', 'vehicle',
  'technology', 'society', 'mmd', 'vtuber', 'radio',
  'sports', 'animal', 'other'
];

// Dynamic genre ID mapping (can be updated at runtime)
const GENRE_ID_MAP: Record<RankingGenre, string> = { ...STATIC_GENRE_ID_MAP };

// Custom group definitions for 8-group strategy
const CUSTOM_GROUPS: string[][] = [
  ['all', 'game'],                              // Group 1
  ['anime', 'vocaloid'],                        // Group 2  
  ['voicesynthesis', 'entertainment'],          // Group 3
  ['music', 'sing'],                            // Group 4
  ['dance', 'play', 'commentary', 'cooking'],   // Group 5 (old Group 3)
  ['travel', 'nature', 'vehicle', 'technology'],// Group 6 (old Group 4)
  ['society', 'mmd', 'vtuber', 'radio'],       // Group 7 (old Group 5)
  ['sports', 'animal', 'other']                 // Group 8 (old Group 6)
];

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

// Migrate legacy NG list to new structure
function migrateLegacyNGList(data: any): NGList {
  // If already in new format, return as-is
  if (data.videoTitles && typeof data.videoTitles === 'object' && Array.isArray(data.videoTitles.exact)) {
    return data as NGList;
  }
  
  // Convert legacy format to new structure
  const legacy = data as LegacyNGList;
  return {
    videoIds: legacy.videoIds || [],
    videoTitles: {
      exact: legacy.videoTitles || [],
      partial: []
    },
    authorIds: legacy.authorIds || [],
    authorNames: {
      exact: legacy.authorNames || [],
      partial: []
    },
    derivedVideoIds: legacy.derivedVideoIds || []
  };
}

// Get NG list - always fetch fresh from KV to ensure latest data
async function getNGList(): Promise<NGList> {
  try {
    // Always fetch fresh NG list from KV to ensure we have the latest data
    // This prevents issues where admin updates NG list between GitHub Actions runs
    console.log('Fetching fresh NG list from KV');
    const [manual, derived] = await Promise.all([
      kv.get<any>('ng-list-manual'),
      kv.get<string[]>('ng-list-derived')
    ]);
    
    const legacyData = {
      videoIds: manual?.videoIds || [],
      videoTitles: manual?.videoTitles || [],
      authorIds: manual?.authorIds || [],
      authorNames: manual?.authorNames || [],
      derivedVideoIds: derived || []
    };
    
    return migrateLegacyNGList(legacyData);
  } catch (error) {
    console.error('Failed to fetch NG list:', error);
    return {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      derivedVideoIds: []
    };
  }
}

// Filter items with NG list and track new derived IDs
function filterWithNGList(items: RankingItem[], ngList: NGList): { filteredItems: RankingItem[], newDerivedIds: string[] } {
  const newDerivedIds: string[] = [];
  
  // High-speed lookups
  const videoIdSet = new Set(ngList.videoIds);
  const derivedVideoIdSet = new Set(ngList.derivedVideoIds);
  const videoTitleExactSet = new Set(ngList.videoTitles.exact);
  const authorIdSet = new Set(ngList.authorIds);
  const authorNameExactSet = new Set(ngList.authorNames.exact);
  
  const filteredItems = items.filter(item => {
    // Already in manual NG list
    if (videoIdSet.has(item.id)) return false;
    
    // Already in derived NG list
    if (derivedVideoIdSet.has(item.id)) return false;
    
    // Title checks
    if (videoTitleExactSet.has(item.title)) {
      newDerivedIds.push(item.id);
      return false;
    }
    
    if (ngList.videoTitles.partial.some(partial => item.title.includes(partial))) {
      newDerivedIds.push(item.id);
      return false;
    }
    
    // Author ID check
    if (item.authorId && authorIdSet.has(item.authorId)) {
      newDerivedIds.push(item.id);
      return false;
    }
    
    // Author name checks
    if (item.authorName && authorNameExactSet.has(item.authorName)) {
      newDerivedIds.push(item.id);
      return false;
    }
    
    if (item.authorName && ngList.authorNames.partial.some(partial => item.authorName!.includes(partial))) {
      newDerivedIds.push(item.id);
      return false;
    }
    
    return true;
  });
  
  return { filteredItems, newDerivedIds };
}

// Fetch ranking page with retry logic
async function fetchRankingPageWithRetry(
  genre: RankingGenre,
  period: '24h' | 'hour',
  tag?: string,
  page: number = 1,
  maxRetries: number = 3
): Promise<{ items: RankingItem[], popularTags: string[] }> {
  let genreId = GENRE_ID_MAP[genre];
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
      
      // Auto-detect genre ID changes
      const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.nicovideo\.jp\/ranking\/genre\/([^?/"]+)/);
      const actualGenreId = canonicalMatch ? canonicalMatch[1] : null;
      
      if (actualGenreId && actualGenreId !== genreId) {
        // Check if this is not a fallback to general ranking
        const titleMatch = html.match(/<title>([^<]+)<\/title>/);
        const isGeneralFallback = titleMatch && titleMatch[1].includes('総合');
        
        if (!isGeneralFallback) {
          // Genre ID has changed - auto-update
          console.log(`⚠️ Genre ID change detected for ${genre}:`);
          console.log(`   Old ID: ${genreId}`);
          console.log(`   New ID: ${actualGenreId}`);
          console.log(`   ✅ Auto-updating to use new ID...`);
          
          // Update the in-memory map
          GENRE_ID_MAP[genre] = actualGenreId;
          genreId = actualGenreId;
          
          // Retry with the new ID
          url = `https://www.nicovideo.jp/ranking/genre/${genreId}?term=${period}`;
          if (tag) url += `&tag=${encodeURIComponent(tag)}`;
          if (page > 1) url += `&page=${page}`;
          
          // Fetch again with the corrected ID
          const correctedResponse = await fetchWithGooglebot(url);
          const correctedHtml = await correctedResponse.text();
          const correctedServerData = extractServerResponseData(correctedHtml);
          const correctedRankingData = correctedServerData.data?.response?.$getTeibanRanking?.data;
          
          if (!correctedRankingData) {
            throw new Error('ランキングデータが見つかりません（修正後）');
          }
          
          const popularTags = extractTrendTags(correctedServerData);
          const startRank = (page - 1) * 100 + 1;
          const items: RankingItem[] = (correctedRankingData.items || []).map((item: any, index: number) => ({
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
            registeredAt: item.registeredAt || item.startTime || item.createTime,
            duration: item.duration
          }));
          
          return { items, popularTags };
        }
      }
      
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
        registeredAt: item.registeredAt || item.startTime || item.createTime,
        duration: item.duration
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
  targetItems: number = 1000
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

      const { filteredItems, newDerivedIds } = filterWithNGList(items, ngList);
      allItems.push(...filteredItems);
      
      // Track new derived IDs for later update
      if (newDerivedIds.length > 0) {
        // Add to ngList for subsequent filtering in same session
        ngList.derivedVideoIds.push(...newDerivedIds);
        console.log(`Found ${newDerivedIds.length} new derived IDs for ${genre}/${period} page ${page}`);
      }

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
  
  // Fetch fixed tags if enabled
  const enableTagFetching = process.env.ENABLE_TAG_FETCHING === 'true';
  const tagFetchMaxVideos = parseInt(process.env.TAG_FETCH_MAX_VIDEOS || '1000', 10);
  const tagFetchGenres = process.env.TAG_FETCH_GENRES?.split(',').filter(Boolean) || [];
  const enableTagFetchingForTagRankings = process.env.TAG_FETCH_FOR_TAG_RANKINGS === 'true';
  
  if (enableTagFetching) {
    console.log(`[${new Date().toISOString()}] Tag details fetching enabled for ${genre}: maxVideos=${tagFetchMaxVideos}, tagRankings=${enableTagFetchingForTagRankings}`);
  }
  
  if (enableTagFetching && (tagFetchGenres.length === 0 || tagFetchGenres.includes(genre))) {
    console.log(`[${new Date().toISOString()}] Fetching tag details for ${genre}...`);
    
    // Fetch tags for 24h data
    if (data24h.items.length > 0) {
      const itemsToFetch = data24h.items.slice(0, tagFetchMaxVideos);
      const itemsWithTags = await enrichRankingItemsWithTagDetails(itemsToFetch);
      // Merge tagged items with remaining untagged items to preserve full array
      data24h.items = [...itemsWithTags, ...data24h.items.slice(tagFetchMaxVideos)];
    }
    
    // Fetch tags for hour data
    if (dataHour.items.length > 0) {
      const itemsToFetch = dataHour.items.slice(0, tagFetchMaxVideos);
      const itemsWithTags = await enrichRankingItemsWithTagDetails(itemsToFetch);
      // Merge tagged items with remaining untagged items to preserve full array
      dataHour.items = [...itemsWithTags, ...dataHour.items.slice(tagFetchMaxVideos)];
    }
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
  
  // Fetch popular tag rankings for ALL genres
  if (popularTags.length > 0) {
    // Fetch ALL popular tags as requested
    const tagsToFetch = popularTags;
    console.log(`[${new Date().toISOString()}] Fetching ALL ${tagsToFetch.length} popular tag rankings for ${genre}`);
    
    // Process ALL popular tags
    for (let i = 0; i < tagsToFetch.length; i++) {
      const tag = tagsToFetch[i];
      try {
        // Add delay between tag fetches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Fetch tag rankings (limit to 300 items)
        const tag24h = await fetchWithNGFiltering(genre, '24h', ngList, tag, 300);
        const tagHour = await fetchWithNGFiltering(genre, 'hour', ngList, tag, 300);
        
        // Apply fixed tags to tag rankings if enabled
        if (enableTagFetching && enableTagFetchingForTagRankings) {
          console.log(`[${new Date().toISOString()}] Enriching tag "${tag}" with tag details (24h: ${tag24h.items.length}, hour: ${tagHour.items.length} items)`);
          
          if (tag24h.items.length > 0) {
            const itemsWithTags24h = await enrichRankingItemsWithTagDetails(tag24h.items);
            result.data['24h'].tags[tag] = itemsWithTags24h;
            console.log(`[${new Date().toISOString()}] Enriched tag "${tag}" 24h with tag details`);
          } else {
            result.data['24h'].tags[tag] = tag24h.items;
          }
          
          if (tagHour.items.length > 0) {
            const itemsWithTagsHour = await enrichRankingItemsWithTagDetails(tagHour.items);
            result.data['hour'].tags[tag] = itemsWithTagsHour;
            console.log(`[${new Date().toISOString()}] Enriched tag "${tag}" hour with tag details`);
          } else {
            result.data['hour'].tags[tag] = tagHour.items;
          }
        } else {
          result.data['24h'].tags[tag] = tag24h.items;
          result.data['hour'].tags[tag] = tagHour.items;
        }
        
        console.log(`[${new Date().toISOString()}] Fetched tag ${i + 1}/${tagsToFetch.length} "${tag}" (24h: ${tag24h.items.length}, hour: ${tagHour.items.length})`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Failed to fetch tag "${tag}":`, error);
        // Continue with other tags
      }
    }
  } else {
    console.log(`[${new Date().toISOString()}] No popular tags found for ${genre}`);
  }
  
  console.log(`[${new Date().toISOString()}] Completed ${genre} (24h: ${data24h.items.length} items, hour: ${dataHour.items.length} items, ${popularTags.length} tags)`);
  
  // DEBUG: Tag fetching results
  console.log(`[DEBUG] Stored ${Object.keys(result.data['24h'].tags).length} tags for ${genre}/24h`);
  console.log(`[DEBUG] Stored ${Object.keys(result.data['hour'].tags).length} tags for ${genre}/hour`);
  if (Object.keys(result.data['24h'].tags).length > 0) {
    const firstTag = Object.keys(result.data['24h'].tags)[0];
    console.log(`[DEBUG] Sample tag "${firstTag}" has ${result.data['24h'].tags[firstTag].length} items`);
  }
  
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
    const originalDerivedCount = ngList.derivedVideoIds.length;
    console.log(`NG list loaded: ${ngList.videoIds.length} video IDs, ${ngList.videoTitles.exact.length + ngList.videoTitles.partial.length} titles, ${ngList.authorIds.length} author IDs, ${ngList.authorNames.exact.length + ngList.authorNames.partial.length} author names, ${ngList.derivedVideoIds.length} derived`);

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

    // Add derived NG data to ranking data to avoid additional KV writes
    const newDerivedCount = ngList.derivedVideoIds.length;
    const newlyAdded = newDerivedCount - originalDerivedCount;
    
    rankingData.derivativeNGData = {
      blockedVideoIds: [...ngList.derivedVideoIds], // Copy array
      blockedAuthorIds: [], // Currently not tracking blocked authors separately
      statsSnapshot: {
        totalVideosProcessed: totalItemsCount,
        totalBlocked: newDerivedCount,
        lastUpdated: new Date().toISOString()
      }
    };

    if (newlyAdded > 0) {
      console.log(`\nAdded ${newlyAdded} new derived NG entries (${originalDerivedCount} → ${newDerivedCount})`);
      console.log('Derived NG data will be included in ranking data (no additional KV writes needed)');
    } else {
      console.log('\nNo new derived NG entries found');
    }
    
    // Write to Cloudflare KV
    console.log('\nWriting ranking data to Cloudflare KV...');
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

// Check if this is being run for a KV group (GENRE_GROUPS based - recommended)
if (process.argv[2] === '--kv-group') {
  const kvGroupId = parseInt(process.argv[3]);

  if (!kvGroupId || kvGroupId < 1 || kvGroupId > 6) {
    console.error('Invalid KV group ID. Usage: --kv-group <1|2|3|4|5|6>');
    process.exit(1);
  }

  // Use GENRE_GROUPS for KV-aligned operation (6グループ分散処理)
  const groupGenres = GENRE_GROUPS[kvGroupId as 1 | 2 | 3 | 4 | 5 | 6].filter(g => g !== 'custom') as RankingGenre[];
  console.log(`Using KV Group ${kvGroupId} with ${groupGenres.length} genres: ${groupGenres.join(', ')}`);

  // Run only for this KV group and save partial results
  (async () => {
    const startTime = Date.now();
    const ngList = await getNGList();
    const originalDerivedCount = ngList.derivedVideoIds.length;
    console.log(`KV Group ${kvGroupId} NG list: ${ngList.videoIds.length} video IDs, ${ngList.videoTitles.exact.length + ngList.videoTitles.partial.length} titles, ${ngList.authorIds.length} author IDs, ${ngList.authorNames.exact.length + ngList.authorNames.partial.length} author names, ${ngList.derivedVideoIds.length} derived`);

    // Process each genre sequentially within group
    const results = [];
    for (const genre of groupGenres) {
      const result = await processGenre(genre, ngList);
      results.push(result);

      // Add delay between genres to avoid rate limiting on getthumbinfo API
      if (genre !== groupGenres[groupGenres.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Save partial results
    const tmpDir = './tmp';
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, `ranking-kv-group-${kvGroupId}.json`),
      JSON.stringify(results, null, 2)
    );

    // Check if new derived entries were found
    const newDerivedCount = ngList.derivedVideoIds.length;
    if (newDerivedCount > originalDerivedCount) {
      const newlyAdded = newDerivedCount - originalDerivedCount;
      console.log(`KV Group ${kvGroupId} found ${newlyAdded} new derived NG entries (${originalDerivedCount} → ${newDerivedCount})`);

      // Save the new derived entries for aggregation
      const derivedData = {
        originalCount: originalDerivedCount,
        newCount: newDerivedCount,
        newEntries: ngList.derivedVideoIds.slice(originalDerivedCount),
        allEntries: ngList.derivedVideoIds
      };

      await fs.writeFile(
        path.join(tmpDir, `ng-derived-kv-group-${kvGroupId}.json`),
        JSON.stringify(derivedData, null, 2)
      );

      console.log(`Saved ${newlyAdded} new derived entries to ng-derived-kv-group-${kvGroupId}.json`);
    }

    const duration = Date.now() - startTime;
    console.log(`KV Group ${kvGroupId} completed in ${Math.round(duration / 1000)}s with ${results.length} genres`);

    // Exit with error if we didn't get all expected genres
    if (results.length !== groupGenres.length) {
      console.error(`ERROR: Expected ${groupGenres.length} genres but only processed ${results.length}`);
      process.exit(1);
    }
  })().catch(error => {
    console.error(`KV Group ${kvGroupId} failed catastrophically:`, error);
    process.exit(1);
  });
} else if (process.argv[2] === '--group') {
  // Legacy: Check if this is being run for a specific group (8-group strategy)
  // Group mode for GitHub Actions matrix strategy
  const groupId = parseInt(process.argv[3]);
  const totalGroups = parseInt(process.argv[4] || '8');
  
  if (!groupId || groupId < 1 || groupId > totalGroups) {
    console.error('Invalid group ID. Usage: --group <groupId> [totalGroups]');
    process.exit(1);
  }
  
  // Use custom groups for better load distribution
  let groupGenres: RankingGenre[];
  if (totalGroups === 8 && groupId <= CUSTOM_GROUPS.length) {
    // Use custom group definitions
    groupGenres = CUSTOM_GROUPS[groupId - 1] as RankingGenre[];
    console.log(`Using custom group ${groupId}/${totalGroups} with genres: ${groupGenres.join(', ')}`);
  } else {
    // Fallback to mechanical division
    const genresPerGroup = Math.ceil(ALL_GENRES.length / totalGroups);
    const startIdx = (groupId - 1) * genresPerGroup;
    const endIdx = Math.min(startIdx + genresPerGroup, ALL_GENRES.length);
    groupGenres = ALL_GENRES.slice(startIdx, endIdx);
    console.log(`Running mechanical group ${groupId}/${totalGroups} with genres: ${groupGenres.join(', ')}`);
  }
  
  // Run only for this group and save partial results
  (async () => {
    const startTime = Date.now();
    const ngList = await getNGList();
    const originalDerivedCount = ngList.derivedVideoIds.length;
    console.log(`Group ${groupId} NG list: ${ngList.videoIds.length} video IDs, ${ngList.videoTitles.exact.length + ngList.videoTitles.partial.length} titles, ${ngList.authorIds.length} author IDs, ${ngList.authorNames.exact.length + ngList.authorNames.partial.length} author names, ${ngList.derivedVideoIds.length} derived`);
    
    // Process each genre sequentially within group
    const results = [];
    for (const genre of groupGenres) {
      const result = await processGenre(genre, ngList);
      results.push(result);
      
      // Add delay between genres to avoid rate limiting on getthumbinfo API
      if (genre !== groupGenres[groupGenres.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Save partial results
    const tmpDir = './tmp';
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, `ranking-group-${groupId}.json`),
      JSON.stringify(results, null, 2)
    );
    
    // Check if new derived entries were found
    const newDerivedCount = ngList.derivedVideoIds.length;
    if (newDerivedCount > originalDerivedCount) {
      const newlyAdded = newDerivedCount - originalDerivedCount;
      console.log(`Group ${groupId} found ${newlyAdded} new derived NG entries (${originalDerivedCount} → ${newDerivedCount})`);
      
      // Save the new derived entries for aggregation
      const derivedData = {
        originalCount: originalDerivedCount,
        newCount: newDerivedCount,
        newEntries: ngList.derivedVideoIds.slice(originalDerivedCount), // Only the new ones
        allEntries: ngList.derivedVideoIds // Complete list for safety
      };
      
      await fs.writeFile(
        path.join(tmpDir, `ng-derived-group-${groupId}.json`),
        JSON.stringify(derivedData, null, 2)
      );
      
      console.log(`Saved ${newlyAdded} new derived entries to ng-derived-group-${groupId}.json`);
    }
    
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
  main();
}