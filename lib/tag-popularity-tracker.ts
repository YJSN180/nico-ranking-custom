// Tag popularity tracking for hybrid caching optimization

import { kv } from '@vercel/kv'

const TAG_POPULARITY_KEY = 'tag-popularity-stats'
const TAG_POPULARITY_TTL = 604800 // 7 days in seconds

export interface TagStats {
  [genre: string]: {
    [tag: string]: {
      count: number
      lastAccessed: string
    }
  }
}

/**
 * Track tag usage for popularity-based caching decisions
 */
export async function trackTagUsage(genre: string, tag: string): Promise<void> {
  try {
    const stats = (await kv.get(TAG_POPULARITY_KEY) || {}) as TagStats
    
    if (!stats[genre]) {
      stats[genre] = {}
    }
    
    if (!stats[genre][tag]) {
      stats[genre][tag] = {
        count: 0,
        lastAccessed: new Date().toISOString()
      }
    }
    
    stats[genre][tag].count++
    stats[genre][tag].lastAccessed = new Date().toISOString()
    
    await kv.set(TAG_POPULARITY_KEY, stats, { ex: TAG_POPULARITY_TTL })
  } catch (error) {
    // Don't fail the request if tracking fails
    console.error('Failed to track tag usage:', error)
  }
}

/**
 * Get popular tags sorted by usage count
 */
export async function getPopularTagsByUsage(
  genre: string, 
  limit: number = 10
): Promise<string[]> {
  try {
    const stats = (await kv.get(TAG_POPULARITY_KEY) || {}) as TagStats
    
    if (!stats[genre]) {
      return []
    }
    
    // Sort tags by usage count
    const sortedTags = Object.entries(stats[genre])
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([tag]) => tag)
      .slice(0, limit)
    
    return sortedTags
  } catch (error) {
    console.error('Failed to get popular tags:', error)
    return []
  }
}

/**
 * Sort tags by popularity, combining usage stats with default order
 */
export function sortTagsByPopularity(
  defaultTags: string[],
  genreStats?: { [tag: string]: { count: number; lastAccessed: string } }
): string[] {
  if (!genreStats) {
    return defaultTags
  }
  
  // Create a map of tag to usage count
  const usageMap = new Map<string, number>()
  Object.entries(genreStats).forEach(([tag, stats]) => {
    usageMap.set(tag, stats.count)
  })
  
  // Sort tags: 
  // 1. By usage count (if available)
  // 2. By default order (if no usage data)
  return [...defaultTags].sort((a, b) => {
    const countA = usageMap.get(a) || 0
    const countB = usageMap.get(b) || 0
    
    if (countA !== countB) {
      return countB - countA // Higher count first
    }
    
    // If counts are equal, preserve default order
    return defaultTags.indexOf(a) - defaultTags.indexOf(b)
  })
}

/**
 * Get cache TTL based on tag popularity
 */
export async function getTagCacheTTL(
  genre: string, 
  tag?: string
): Promise<number> {
  if (!tag) {
    return 3600 // 1 hour for genre rankings
  }
  
  const popularTags = await getPopularTagsByUsage(genre, 20)
  const tagRank = popularTags.indexOf(tag)
  
  if (tagRank >= 0 && tagRank < 10) {
    return 3600 // Top 10: 1 hour
  } else if (tagRank >= 10 && tagRank < 20) {
    return 7200 // Top 11-20: 2 hours  
  } else {
    return 1800 // Others: 30 minutes
  }
}

/**
 * Clean up old tag stats (remove tags not accessed in 30 days)
 */
export async function cleanupOldTagStats(): Promise<void> {
  try {
    const stats = (await kv.get(TAG_POPULARITY_KEY) || {}) as TagStats
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    
    let cleaned = false
    
    Object.keys(stats).forEach(genre => {
      Object.keys(stats[genre]).forEach(tag => {
        const lastAccessed = new Date(stats[genre][tag].lastAccessed)
        if (lastAccessed < thirtyDaysAgo) {
          delete stats[genre][tag]
          cleaned = true
        }
      })
      
      // Remove genre if no tags left
      if (Object.keys(stats[genre]).length === 0) {
        delete stats[genre]
      }
    })
    
    if (cleaned) {
      await kv.set(TAG_POPULARITY_KEY, stats, { ex: TAG_POPULARITY_TTL })
    }
  } catch (error) {
    console.error('Failed to cleanup tag stats:', error)
  }
}