import { v } from "convex/values";
import { internalAction, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { gzip } from "pako";
import { putToCloudflareKV } from "../lib/cloudflare-kv";

// 全ジャンルの定義
const ALL_GENRES = [
  'all', 'game', 'anime', 'vocaloid', 'voicesynthesis', 
  'entertainment', 'music', 'sing', 'dance', 'play',
  'commentary', 'cooking', 'travel', 'nature', 'vehicle',
  'technology', 'society', 'mmd', 'vtuber', 'radio',
  'sports', 'animal', 'other'
] as const;

const PERIODS = ['24h', 'hour'] as const;

// ジャンルIDマッピング
const GENRE_ID_MAP: Record<string, string> = {
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

// Googlebot UAを使用してジオブロックを回避
async function fetchWithGooglebot(url: string): Promise<string> {
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
  
  return response.text();
}

// server-responseメタタグからJSONデータを抽出
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

// 人気タグを抽出
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

// HTMLからタグ情報を抽出
function enrichItemsWithTags(items: any[], html: string): any[] {
  const tagPattern = /<li class="TagList-item"[^>]*>\s*<a[^>]+href="\/tag\/([^"]+)"[^>]*>([^<]+)<\/a>/g;
  const itemTags = new Map<string, string[]>();
  
  let match;
  while ((match = tagPattern.exec(html)) !== null) {
    const encodedTag = match[1];
    const tagText = match[2];
    
    if (encodedTag && tagText) {
      try {
        const decodedTag = decodeURIComponent(encodedTag);
        // タグをアイテムに関連付けるロジックが必要
      } catch {
        // デコードエラーは無視
      }
    }
  }
  
  return items;
}

// 単一ジャンルのランキングを取得（最大500件）
async function fetchGenreRanking(
  genre: string,
  period: string
): Promise<{ items: any[], popularTags: string[] }> {
  const genreId = GENRE_ID_MAP[genre] || genre;
  const allItems: any[] = [];
  const popularTags: string[] = [];
  
  // 5ページ（500件）まで取得
  for (let page = 1; page <= 5; page++) {
    try {
      const url = `https://www.nicovideo.jp/ranking/genre/${genreId}?term=${period}&page=${page}`;
      const html = await fetchWithGooglebot(url);
      
      const serverData = extractServerResponseData(html);
      const rankingData = serverData.data?.response?.$getTeibanRanking?.data;
      
      if (!rankingData || !rankingData.items || rankingData.items.length === 0) {
        break;
      }
      
      // 初回ページから人気タグを取得
      if (page === 1) {
        const tags = extractTrendTags(serverData);
        popularTags.push(...tags);
      }
      
      // アイテムを整形
      const startRank = (page - 1) * 100 + 1;
      const items = (rankingData.items || []).map((item: any, index: number) => ({
        rank: startRank + index,
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
      
      allItems.push(...enrichItemsWithTags(items, html));
      
      // レート制限対策
      if (page < 5) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`Failed to fetch ${genre} page ${page}:`, error);
      break;
    }
  }
  
  return { items: allItems, popularTags };
}

// タグ別ランキングを取得（最大500件）
async function fetchTagRanking(
  genre: string,
  tag: string,
  period: string
): Promise<any[]> {
  const genreId = GENRE_ID_MAP[genre] || genre;
  const allItems: any[] = [];
  
  // 5ページ（500件）まで取得
  for (let page = 1; page <= 5; page++) {
    try {
      const url = `https://www.nicovideo.jp/ranking/genre/${genreId}?term=${period}&tag=${encodeURIComponent(tag)}&page=${page}`;
      const html = await fetchWithGooglebot(url);
      
      const serverData = extractServerResponseData(html);
      const rankingData = serverData.data?.response?.$getTeibanRanking?.data;
      
      if (!rankingData || !rankingData.items || rankingData.items.length === 0) {
        break;
      }
      
      // アイテムを整形
      const startRank = (page - 1) * 100 + 1;
      const items = (rankingData.items || []).map((item: any, index: number) => ({
        rank: startRank + index,
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
      
      allItems.push(...enrichItemsWithTags(items, html));
      
      // レート制限対策
      if (page < 5) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`Failed to fetch tag ${tag} in ${genre} page ${page}:`, error);
      break;
    }
  }
  
  return allItems;
}

// 全ランキングデータを更新
export const updateAllRankings = internalAction({
  args: {},
  handler: async (ctx: any) => {
    const timestamp = new Date().toISOString();
    const fullSnapshot: any = {
      timestamp,
      version: "1.0",
      genres: {}
    };
    
    // 全ジャンル × 全期間のデータを取得
    for (const genre of ALL_GENRES) {
      fullSnapshot.genres[genre] = {};
      
      for (const period of PERIODS) {
        try {
          console.log(`Fetching ${genre} - ${period}`);
          const { items, popularTags } = await fetchGenreRanking(genre, period);
          
          fullSnapshot.genres[genre][period] = {
            items,
            popularTags
          };
          
          // データベースに保存（履歴用）
          await ctx.runMutation(internal.ranking.saveSnapshot, {
            timestamp,
            genre,
            period,
            items,
            popularTags
          });
          
          // 人気タグ別ランキングも取得（上位5タグのみ）
          const topTags = popularTags.slice(0, 5);
          for (const tag of topTags) {
            try {
              console.log(`Fetching tag ${tag} in ${genre} - ${period}`);
              const tagItems = await fetchTagRanking(genre, tag, period);
              
              if (!fullSnapshot.genres[genre][period].tags) {
                fullSnapshot.genres[genre][period].tags = {};
              }
              fullSnapshot.genres[genre][period].tags[tag] = tagItems;
              
              // タグ別ランキングをキャッシュに保存
              await ctx.runMutation(internal.ranking.saveTagRankingCache, {
                genre,
                period,
                tag,
                items: tagItems
              });
              
              // レート制限対策
              await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
              console.error(`Failed to fetch tag ${tag}:`, error);
            }
          }
        } catch (error) {
          console.error(`Failed to fetch ${genre} - ${period}:`, error);
        }
        
        // ジャンル間の待機
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // フルスナップショットをgzip圧縮
    const compressed = gzip(JSON.stringify(fullSnapshot));
    
    // Cloudflare KVに保存
    await putToCloudflareKV("RANKING_LATEST", compressed);
    
    console.log("All rankings updated successfully");
  }
});

// スナップショットを保存
export const saveSnapshot = internalMutation({
  args: {
    timestamp: v.string(),
    genre: v.string(),
    period: v.string(),
    items: v.array(v.any()),
    popularTags: v.array(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await ctx.db.insert("rankingSnapshots", {
      timestamp: args.timestamp,
      genre: args.genre,
      period: args.period,
      items: args.items,
      popularTags: args.popularTags,
    });
  }
});

// タグ別ランキングをキャッシュに保存
export const saveTagRankingCache = internalMutation({
  args: {
    genre: v.string(),
    period: v.string(),
    tag: v.string(),
    items: v.array(v.any()),
  },
  handler: async (ctx: any, args: any) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1時間後
    
    // 既存のキャッシュを確認
    const existing = await ctx.db
      .query("tagRankingCache")
      .withIndex("by_genre_period_tag", (q: any) => 
        q.eq("genre", args.genre)
         .eq("period", args.period)
         .eq("tag", args.tag)
      )
      .first();
    
    if (existing) {
      // 更新
      await ctx.db.patch(existing._id, {
        items: args.items,
        updatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });
    } else {
      // 新規作成
      await ctx.db.insert("tagRankingCache", {
        genre: args.genre,
        period: args.period,
        tag: args.tag,
        items: args.items,
        updatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });
    }
  }
});

// 期限切れのタグキャッシュをクリーンアップ
export const cleanupExpiredTagCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    
    const expired = await ctx.db
      .query("tagRankingCache")
      .withIndex("by_expires", (q: any) => q.lt("expiresAt", now))
      .collect();
    
    for (const item of expired) {
      await ctx.db.delete(item._id);
    }
    
    console.log(`Cleaned up ${expired.length} expired tag cache entries`);
  }
});

// 最新のランキングデータを取得（クエリ）
export const getLatestRanking = query({
  args: {
    genre: v.string(),
    period: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const snapshot = await ctx.db
      .query("rankingSnapshots")
      .withIndex("by_genre_period", (q: any) => 
        q.eq("genre", args.genre).eq("period", args.period)
      )
      .order("desc")
      .first();
    
    return snapshot;
  }
});

// タグ別ランキングを取得（クエリ）
export const getTagRanking = query({
  args: {
    genre: v.string(),
    period: v.string(),
    tag: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const cache = await ctx.db
      .query("tagRankingCache")
      .withIndex("by_genre_period_tag", (q: any) => 
        q.eq("genre", args.genre)
         .eq("period", args.period)
         .eq("tag", args.tag)
      )
      .first();
    
    if (cache && new Date(cache.expiresAt) > new Date()) {
      return cache.items;
    }
    
    return null;
  }
});