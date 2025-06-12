#!/usr/bin/env npx tsx
import 'dotenv/config'
import type { RankingGenre } from '../types/ranking-config'
import type { RankingItem } from '../types/ranking'
import { kv } from '../lib/simple-kv'

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
    throw new Error(`Fetch failed: ${response.status}`);
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

// Get NG list from Cloudflare KV
async function getNGList(): Promise<NGList> {
  try {
    console.log('Fetching NG list from Cloudflare KV...');
    
    const [manual, derived] = await Promise.all([
      kv.get<Omit<NGList, 'derivedVideoIds'>>('ng-list-manual').catch(err => {
        console.warn('Failed to fetch ng-list-manual:', err.message);
        return null;
      }),
      kv.get<string[]>('ng-list-derived').catch(err => {
        console.warn('Failed to fetch ng-list-derived:', err.message);
        return null;
      })
    ]);
    
    const ngList = {
      videoIds: manual?.videoIds || [],
      videoTitles: manual?.videoTitles || [],
      authorIds: manual?.authorIds || [],
      authorNames: manual?.authorNames || [],
      derivedVideoIds: derived || []
    };
    
    console.log(`NG list loaded: ${ngList.videoIds.length} video IDs, ${ngList.videoTitles.length} titles, ${ngList.authorIds.length} author IDs, ${ngList.authorNames.length} author names, ${ngList.derivedVideoIds.length} derived IDs`);
    
    return ngList;
  } catch (error) {
    console.warn('Failed to fetch NG list, proceeding with empty list:', error);
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

// Main function
async function main() {
  const startTime = Date.now();
  
  try {
    console.log('Starting ranking update...');
    console.log(`Node.js version: ${process.version}`);
    console.log(`Environment: GitHub Actions`);
    
    // Validate environment variables
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN;

    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      console.error('❌ Missing required environment variables:');
      console.error(`  CLOUDFLARE_ACCOUNT_ID: ${CF_ACCOUNT_ID ? '✅' : '❌'}`);
      console.error(`  CLOUDFLARE_KV_NAMESPACE_ID: ${CF_NAMESPACE_ID ? '✅' : '❌'}`);
      console.error(`  CLOUDFLARE_KV_API_TOKEN: ${CF_API_TOKEN ? '✅' : '❌'}`);
      throw new Error('Cloudflare KV credentials not configured');
    }
    
    console.log('✅ All environment variables are configured');
    console.log(`Account ID: ${CF_ACCOUNT_ID}`);
    console.log(`Namespace ID: ${CF_NAMESPACE_ID}`);
    console.log(`API Token: ${CF_API_TOKEN.substring(0, 8)}...`);
    
    // Get NG list
    const ngList = await getNGList();

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

    const periods: ('24h' | 'hour')[] = ['24h', 'hour'];
    let totalGenresUpdated = 0;
    let totalItemsCount = 0;

    // Fetch all genres
    for (const genre of ALL_GENRES) {
      rankingData.genres[genre] = {};

      for (const period of periods) {
        try {
          console.log(`Fetching ${genre}/${period} with NG filtering...`);
          const { items, popularTags } = await fetchWithNGFiltering(genre, period, ngList);
          
          rankingData.genres[genre][period] = {
            items,
            popularTags,
            tags: {}
          };

          totalItemsCount += items.length;

          // Fetch popular tag rankings
          if (popularTags.length > 0) {
            for (const tag of popularTags) {
              try {
                console.log(`Fetching tag ranking for ${genre}/${period}/${tag}...`);
                const { items: tagItems } = await fetchWithNGFiltering(genre, period, ngList, tag);
                rankingData.genres[genre][period].tags[tag] = tagItems;
                totalItemsCount += tagItems.length;
                
                await new Promise(resolve => setTimeout(resolve, 500));
              } catch (error) {
                console.error(`Failed to fetch tag ranking for ${genre}/${period}/${tag}:`, error);
              }
            }
          }

          totalGenresUpdated++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Failed to fetch ${genre}/${period}:`, error);
        }
      }
    }

    rankingData.metadata.totalItems = totalItemsCount;

    // Write to Cloudflare KV
    console.log('Writing to Cloudflare KV...');
    await writeToCloudflareKV(rankingData);

    const duration = Date.now() - startTime;
    console.log(`Update completed successfully in ${Math.round(duration / 1000)}s`);
    console.log(`Genres updated: ${totalGenresUpdated}`);
    console.log(`Total items: ${totalItemsCount}`);
  } catch (error) {
    console.error('Update failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}