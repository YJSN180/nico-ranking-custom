/**
 * Tag Aggregator Worker
 * 
 * Phase 2: 人気タグの集計とタグ別ランキングの取得
 * 30秒の制限内で効率的にタグを処理
 */

import { KVBatchWriter, DataOptimizer } from './kv-batch-writer'

interface TagStats {
  tag: string
  count: number
  genres: Set<string>
  lastSeen: string
}

export class TagAggregator {
  private env: any
  private batchWriter: KVBatchWriter
  
  constructor(env: any) {
    this.env = env
    this.batchWriter = new KVBatchWriter(env.RANKING_DATA)
  }
  
  /**
   * Phase 2: 人気タグの集計
   */
  async aggregatePopularTags(): Promise<void> {
    const startTime = Date.now()
    const tagStats = new Map<string, TagStats>()
    
    try {
      // すべてのジャンルの基本ランキングから人気タグを収集
      const genres = ['all', 'game', 'entertainment', 'other', 'technology', 'anime', 'voicesynthesis']
      const periods = ['24h', 'hour']
      
      // 並列で取得（メモリ効率を考慮）
      for (const period of periods) {
        const promises = genres.map(genre => this.collectTagsFromGenre(genre, period))
        const results = await Promise.all(promises)
        
        // タグ統計を集計
        for (const tags of results) {
          for (const [tag, stats] of tags) {
            const existing = tagStats.get(tag) || {
              tag,
              count: 0,
              genres: new Set<string>(),
              lastSeen: new Date().toISOString()
            }
            
            existing.count += stats.count
            stats.genres.forEach(g => existing.genres.add(g))
            tagStats.set(tag, existing)
          }
        }
      }
      
      // 人気タグをソート（出現回数順）
      const popularTags = Array.from(tagStats.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 50) // 上位50個
        .map(([tag]) => tag)
      
      // 各ジャンルの人気タグを保存
      await this.savePopularTagsByGenre(tagStats, genres)
      
      // 全体の人気タグを保存
      await this.batchWriter.add({
        key: 'popular-tags-global',
        value: JSON.stringify({
          tags: popularTags,
          stats: Object.fromEntries(
            Array.from(tagStats.entries()).slice(0, 100)
          ),
          updatedAt: new Date().toISOString()
        }),
        expirationTtl: 3600
      })
      
      // バックアップの作成（4時間ごと）
      const hour = new Date().getHours()
      if (hour % 4 === 0) {
        await this.createTagBackup(popularTags)
      }
      
      const elapsed = Date.now() - startTime
      console.log(`Tag aggregation completed in ${elapsed}ms`)
      
      // Phase 3: 重要なタグランキングの取得をトリガー
      if (elapsed < 20000) { // 20秒以内なら続行
        await this.triggerPhase3(popularTags.slice(0, 10)) // 上位10タグ
      }
      
    } catch (error) {
      console.error('Tag aggregation failed:', error)
      throw error
    }
  }
  
  /**
   * ジャンルからタグを収集
   */
  private async collectTagsFromGenre(
    genre: string, 
    period: string
  ): Promise<Map<string, TagStats>> {
    const key = `ranking-${genre}-${period}`
    const compressed = await this.env.RANKING_DATA.get(key)
    
    if (!compressed) {
      return new Map()
    }
    
    // 解凍
    const data = await DataOptimizer.decompress(compressed)
    const items = DataOptimizer.restoreRankingData(data)
    
    // タグを集計
    const tagMap = new Map<string, TagStats>()
    
    for (const item of items) {
      if (!item.tags || !Array.isArray(item.tags)) continue
      
      for (const tag of item.tags) {
        if (!tag || typeof tag !== 'string') continue
        
        const stats = tagMap.get(tag) || {
          tag,
          count: 0,
          genres: new Set([genre]),
          lastSeen: new Date().toISOString()
        }
        
        stats.count++
        tagMap.set(tag, stats)
      }
    }
    
    return tagMap
  }
  
  /**
   * ジャンル別の人気タグを保存
   */
  private async savePopularTagsByGenre(
    globalStats: Map<string, TagStats>,
    genres: string[]
  ): Promise<void> {
    const writes: any[] = []
    
    for (const genre of genres) {
      // そのジャンルに関連するタグのみ抽出
      const genreTags = Array.from(globalStats.entries())
        .filter(([_, stats]) => stats.genres.has(genre))
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)
        .map(([tag]) => tag)
      
      writes.push({
        key: `popular-tags-${genre}`,
        value: JSON.stringify({
          tags: genreTags,
          updatedAt: new Date().toISOString()
        }),
        expirationTtl: 3600
      })
    }
    
    await this.batchWriter.addBatch(writes)
  }
  
  /**
   * タグのバックアップを作成
   */
  private async createTagBackup(tags: string[]): Promise<void> {
    const now = new Date()
    const backupKey = `popular-tags-backup:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}:${String(now.getHours()).padStart(2, '0')}`
    
    await this.batchWriter.add({
      key: backupKey,
      value: JSON.stringify({
        tags,
        createdAt: now.toISOString()
      }),
      expirationTtl: 86400 * 7 // 7日間保持
    })
  }
  
  /**
   * Phase 3をトリガー
   */
  private async triggerPhase3(topTags: string[]): Promise<void> {
    const tasks = []
    
    // 各人気タグのランキングを取得するタスクを作成
    for (const tag of topTags) {
      for (const genre of ['all', 'game', 'entertainment']) {
        for (const period of ['24h', 'hour']) {
          tasks.push({
            type: 'fetch_tag_ranking',
            tag,
            genre,
            period
          })
        }
      }
    }
    
    // Queueに送信
    await this.env.RANKING_QUEUE.sendBatch(
      tasks.map(task => ({ body: task }))
    )
  }
}

/**
 * Phase 3: タグ別ランキングの取得
 */
export async function fetchTagRanking(
  tag: string,
  genre: string,
  period: string,
  env: any
): Promise<void> {
  const url = `https://www.nicovideo.jp/ranking/genre/${getGenreId(genre)}?term=${period}&tag=${encodeURIComponent(tag)}`
  
  try {
    // Googlebot UAでフェッチ
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch tag ranking: ${response.status}`)
    }
    
    const html = await response.text()
    const items = parseTagRankingItems(html)
    
    // 圧縮して保存
    const key = `ranking-${genre}-${period}-tag-${tag}`
    const optimized = DataOptimizer.optimizeRankingData(items.slice(0, 100))
    const compressed = await DataOptimizer.compress(optimized)
    
    await env.RANKING_DATA.put(key, compressed, {
      expirationTtl: 3600,
      metadata: {
        compressed: true,
        tag,
        itemCount: items.length
      }
    })
    
  } catch (error) {
    console.error(`Failed to fetch tag ranking for ${tag}:`, error)
    // エラーでも処理を継続
  }
}

/**
 * タグランキングのパース
 */
function parseTagRankingItems(html: string): any[] {
  // 基本的なパース処理（実装は complete-hybrid-scraper と同様）
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
  if (!metaMatch) return []
  
  try {
    const encodedData = metaMatch[1]!
    const decodedData = encodedData
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
    
    const serverData = JSON.parse(decodedData)
    const items = serverData.data?.response?.$getTeibanRanking?.data?.items || []
    
    return items.map((item: any, index: number) => ({
      rank: index + 1,
      id: item.id,
      title: item.title,
      thumbURL: item.thumbnail?.url || '',
      views: item.count?.view || 0,
      comments: item.count?.comment || 0,
      mylists: item.count?.mylist || 0,
      likes: item.count?.like || 0,
      tags: item.tags || [],
      registeredAt: item.registeredAt
    }))
  } catch (error) {
    console.error('Failed to parse tag ranking:', error)
    return []
  }
}

function getGenreId(genre: string): string {
  const mapping: Record<string, string> = {
    'all': 'all',
    'entertainment': 'ent',
    'game': 'game',
    'other': 'other',
    'technology': 'tech',
    'anime': 'anime',
    'voicesynthesis': 'vocaloid'
  }
  return mapping[genre] || genre
}