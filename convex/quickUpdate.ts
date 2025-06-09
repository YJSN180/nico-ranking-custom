import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { gzip } from "pako";
import { putToCloudflareKV } from "../lib/cloudflare-kv";

// Quick update for testing - only cached genres, no tag rankings
const CACHED_GENRES = ['all', 'game', 'entertainment', 'other', 'technology', 'anime', 'voicesynthesis'];
const PERIODS = ['24h', 'hour'] as const;

// ジャンルIDマッピング
const GENRE_ID_MAP: Record<string, string> = {
  all: 'e9uj2uks',
  game: '4eet3ca4',
  anime: 'zc49b03a',
  entertainment: '8kjl94d9',
  technology: 'n46kcz9u',
  voicesynthesis: 'e2bi9pt8',
  other: 'ramuboyn'
};

async function fetchWithGooglebot(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.text();
}

function extractServerResponseData(html: string): any {
  const match = html.match(/<script id="js-state-data" type="application\/json" data-sore data-state>([^<]+)<\/script>/);
  if (!match || !match[1]) return { data: null };
  
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    return { data: null };
  }
}

async function fetchGenreRanking(
  genre: string,
  period: string
): Promise<{ items: any[], popularTags: string[] }> {
  const genreId = GENRE_ID_MAP[genre] || genre;
  
  try {
    const url = `https://www.nicovideo.jp/ranking/genre/${genreId}?term=${period}&page=1`;
    const html = await fetchWithGooglebot(url);
    
    const serverData = extractServerResponseData(html);
    const rankingData = serverData.data?.response?.$getTeibanRanking?.data;
    
    if (!rankingData || !rankingData.items) {
      return { items: [], popularTags: [] };
    }
    
    // Get popular tags from trend tags
    const popularTags: string[] = [];
    const trendTags = serverData.data?.response?.$getTrendTags?.data?.tags || [];
    for (const tag of trendTags) {
      if (tag.name) {
        popularTags.push(tag.name);
      }
    }
    
    // Format items (first 100 only for quick update)
    const items = (rankingData.items || []).map((item: any, index: number) => ({
      rank: index + 1,
      id: item.id,
      title: item.title,
      thumbURL: item.thumbnail?.url || item.thumbnail?.middleUrl || '',
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
  } catch (error) {
    console.error(`Failed to fetch ${genre} - ${period}:`, error);
    return { items: [], popularTags: [] };
  }
}

export const quickUpdate = internalAction({
  args: {},
  handler: async (ctx: any) => {
    console.log("Starting quick update for cached genres only...");
    const timestamp = new Date().toISOString();
    const fullSnapshot: any = {
      timestamp,
      version: "1.0",
      genres: {}
    };
    
    // Only fetch cached genres
    for (const genre of CACHED_GENRES) {
      fullSnapshot.genres[genre] = {};
      
      for (const period of PERIODS) {
        try {
          console.log(`Fetching ${genre} - ${period}`);
          const { items, popularTags } = await fetchGenreRanking(genre, period);
          
          fullSnapshot.genres[genre][period] = {
            items,
            popularTags,
            tags: {} // Empty for quick update
          };
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Failed to fetch ${genre} - ${period}:`, error);
          fullSnapshot.genres[genre][period] = {
            items: [],
            popularTags: [],
            tags: {}
          };
        }
      }
    }
    
    // Compress and save to KV
    const compressed = gzip(JSON.stringify(fullSnapshot));
    await putToCloudflareKV("RANKING_LATEST", compressed);
    
    console.log("Quick update completed successfully");
    return { timestamp, genresUpdated: Object.keys(fullSnapshot.genres).length };
  }
});