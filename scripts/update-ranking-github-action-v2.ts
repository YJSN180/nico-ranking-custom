#!/usr/bin/env npx tsx
import 'dotenv/config'
import type { RankingGenre } from '../types/ranking-config'
import type { RankingItem } from '../types/ranking'
import { kv } from '../lib/simple-kv'
import { filterWithNGList, type NGFilterResult } from '../lib/filter-with-ng-list'
import { migrateLegacyNGList } from '../lib/ng-list-migration'
import type { NGList } from '../types/ng-list'

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
  anime: 'jj8xstm5',
  vocaloid: '2387k7f0',
  voicesynthesis: 'bl6dw7dt',
  entertainment: 'i0r80vw9',
  music: 'qf9abh4u',
  sing: 'dut8alho',
  dance: 'i7kt2ofg',
  play: 'cq7c2dgs',
  commentary: 'fz8wbptt',
  cooking: 'zn2dxcqy',
  travel: 'dqx66ohf',
  nature: 'c76tkfpw',
  vehicle: 'j0ukjucs',
  technology: 'ck6z8fm3',
  society: '5bz3k5p4',
  mmd: 'lq2x5sj6',
  vtuber: 'dqejbz8k',
  radio: 'u2yzqvqs',
  sports: 'j0elcm8h',
  animal: '9me9qfzv',
  other: 'd2hlgvae'
};

// Fetch with Googlebot user agent to bypass geo-blocking
async function fetchWithGooglebot(url: string): Promise<Response> {
  const maxRetries = 10;
  const baseDelay = 3000;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = baseDelay * Math.pow(1.5, attempt - 1) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        }
      });
      
      if (response.ok) return response;
      if (response.status === 403) continue;
      if (response.status === 404) throw new Error(`Fetch failed: 404`);
      throw new Error(`Fetch failed: ${response.status}`);
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

// Extract server response data
function extractServerResponseData(html: string): any {
  const metaMatch = html.match(/<meta\s+name="server-response"\s+content="([^"]+)"/);
  if (!metaMatch) {
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

// Get NG list from Vercel KV
async function getNGList(): Promise<NGList> {
  try {
    const [manualRaw, derived] = await Promise.all([
      kv.get<NGList | any>('ng-list-manual'),
      kv.get<string[]>('ng-list-derived')
    ]);
    
    // Migrate manual list if needed
    const manual = manualRaw ? migrateLegacyNGList(manualRaw) : null;
    
    // Combine manual and derived video IDs
    const combinedVideoIds = [
      ...(manual?.videoIds || []),
      ...(derived || [])
    ];
    
    return {
      videoIds: combinedVideoIds,
      videoTitles: manual?.videoTitles || { exact: [], partial: [] },
      authorIds: manual?.authorIds || [],
      authorNames: manual?.authorNames || { exact: [], partial: [] }
    };
  } catch (error) {
    console.error('Failed to fetch NG list:', error);
    return {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] }
    };
  }
}

// Fetch ranking page
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
    views: item.stats?.views || 0,
    comments: item.stats?.comments || 0,
    mylists: item.stats?.mylists || 0,
    likes: item.stats?.likes || 0,
    authorId: item.owner?.id,
    authorName: item.owner?.name || item.owner?.nickname,
    authorIcon: item.owner?.iconUrl,
    registeredAt: item.registeredAt || item.publishedAt || item.startTime
  }));

  return { items, popularTags };
}

// Fetch with NG filtering
async function fetchWithNGFiltering(
  genre: RankingGenre,
  period: '24h' | 'hour',
  ngList: NGList,
  tag?: string
): Promise<{ items: RankingItem[], popularTags: string[], newDerivedIds: string[] }> {
  const MAX_PAGES = 10;
  const REQUIRED_ITEMS = 100;
  
  let allItems: RankingItem[] = [];
  let allDerivedIds: string[] = [];
  let popularTags: string[] = [];
  let page = 1;
  
  while (allItems.length < REQUIRED_ITEMS && page <= MAX_PAGES) {
    try {
      const { items, popularTags: tags } = await fetchRankingPage(genre, period, tag, page);
      
      if (page === 1) {
        popularTags = tags;
      }
      
      if (items.length === 0) break;
      
      // Apply NG filtering
      const filterResult = filterWithNGList(items, ngList);
      allItems.push(...filterResult.filteredItems);
      allDerivedIds.push(...filterResult.newDerivedIds);
      
      console.log(`Fetched page ${page} for ${genre}/${period}${tag ? `/${tag}` : ''}: ${items.length} items, ${filterResult.filteredItems.length} after filtering`);
      
      if (items.length < 100) break;
      page++;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        break;
      }
      console.error(`Failed to fetch page ${page} for ${genre}/${period}: ${error}`);
      if (page > 3) break;
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // 順位を振り直す
  allItems.forEach((item, index) => {
    item.rank = index + 1;
  });
  
  return {
    items: allItems.slice(0, REQUIRED_ITEMS),
    popularTags,
    newDerivedIds: allDerivedIds
  };
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

  // Add a small random delay to prevent concurrent writes from different workflow runs
  const jitter = Math.random() * 5000; // 0-5 seconds
  console.log(`Adding ${Math.round(jitter)}ms jitter before KV write to prevent concurrent access`);
  await new Promise(resolve => setTimeout(resolve, jitter));

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`;

  const maxRetries = 1; // 無料プラン制限を考慮して1回のみ
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
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
        console.error(`KV write failed: ${response.status} - ${error}`);
        if (response.status === 429 && error.includes('free usage limit')) {
          console.error('Daily KV write limit reached. Will retry tomorrow.');
          return; // Don't throw error to prevent workflow failure
        }
        throw new Error(`Cloudflare KV write failed: ${response.status} - ${error}`);
      }
      
      console.log('Successfully wrote ranking data to KV');
      
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
      
      return;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Main function
async function main() {
  const startTime = Date.now();
  
  try {
    console.log('Starting ranking update...');
    
    // Get NG list
    const ngList = await getNGList();
    console.log(`NG list loaded: ${ngList.videoIds.length} video IDs, ${ngList.videoTitles.exact.length} exact titles, ${ngList.videoTitles.partial.length} partial titles`);

    // Data structure
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
    const allNewDerivedIds: string[] = [];
    
    // Fetch all genres
    for (const genre of ALL_GENRES) {
      console.log(`\nFetching ${genre}...`);
      
      const genreData: any = {
        '24h': { items: [], popularTags: [], tags: {} },
        'hour': { items: [], popularTags: [], tags: {} }
      };
      
      // Fetch both periods
      for (const period of ['24h', 'hour'] as const) {
        try {
          console.log(`Fetching ${genre}/${period} with NG filtering...`);
          const { items, popularTags, newDerivedIds } = await fetchWithNGFiltering(genre, period, ngList);
          
          genreData[period].items = items;
          genreData[period].popularTags = popularTags;
          
          totalItemsCount += items.length;
          allNewDerivedIds.push(...newDerivedIds);
          
          // タグランキングは負荷軽減のため省略
          
          await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limiting
        } catch (error) {
          console.error(`Failed to fetch ${genre}/${period}:`, error);
        }
      }
      
      rankingData.genres[genre] = genreData;
    }
    
    rankingData.metadata.totalItems = totalItemsCount;
    
    // Write to Cloudflare KV
    console.log(`\nWriting data to Cloudflare KV (${totalItemsCount} items)...`);
    await writeToCloudflareKV(rankingData);
    
    // Update derived NG list in batch (single write)
    if (allNewDerivedIds.length > 0) {
      console.log(`Updating derived NG list with ${allNewDerivedIds.length} new items...`);
      try {
        const existingDerived = await kv.get<string[]>('ng-list-derived') || [];
        const newSet = new Set([...existingDerived, ...allNewDerivedIds]);
        await kv.set('ng-list-derived', Array.from(newSet));
        console.log('Derived NG list updated successfully');
      } catch (error) {
        console.error('Failed to update derived NG list:', error);
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n✅ Update completed in ${duration} seconds`);
    
  } catch (error) {
    console.error('Update failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}