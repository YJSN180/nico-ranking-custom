// Enhanced tag extraction using Snapshot API
// Addresses the issue where tags are returned as strings instead of arrays

import type { RankingItem } from '@/types/ranking'

const SNAPSHOT_API_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'

// User agent for API requests
const USER_AGENT = 'nico-ranking-app/1.0'

interface SnapshotVideoData {
  contentId: string
  title: string
  tags?: string  // Tags are returned as a space-separated string
  categoryTags?: string
  viewCounter: number
  commentCounter: number
  mylistCounter: number
  likeCounter?: number
}

interface SnapshotAPIResponse {
  meta: {
    status: number
    totalCount: number
  }
  data: SnapshotVideoData[]
}

// Convert space-separated tag string to array
function parseTagString(tagString: string | undefined): string[] {
  if (!tagString || typeof tagString !== 'string') {
    return []
  }
  
  // Split by spaces and filter out empty strings
  return tagString
    .split(' ')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
}

// Fetch video data from Snapshot API in batches
export async function fetchVideoTagsBatch(videoIds: string[]): Promise<Map<string, string[]>> {
  const tagMap = new Map<string, string[]>()
  
  if (videoIds.length === 0) {
    return tagMap
  }
  
  // Process in batches of 50 to avoid query length limits
  const batchSize = 50
  
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize)
    
    try {
      // Create a search query for multiple content IDs
      // Use title search with specific content IDs in the query
      const params = new URLSearchParams({
        q: batch.map(id => `"${id}"`).join(' OR '),  // Search for exact video IDs
        targets: 'title',  // Search in title field
        fields: 'contentId,tags,categoryTags',
        _limit: String(batch.length * 2)  // Allow some buffer for matches
      })
      
      const fullUrl = `${SNAPSHOT_API_URL}?${params}`
      
      const response = await fetch(fullUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json'
        }
      })
      
      if (!response.ok) {
        console.warn(`Snapshot API request failed for batch ${i}: ${response.status}`)
        continue
      }
      
      const data: SnapshotAPIResponse = await response.json()
      
      if (data.data && Array.isArray(data.data)) {
        data.data.forEach(video => {
          if (batch.includes(video.contentId)) {
            const tags = parseTagString(video.tags)
            if (tags.length > 0) {
              tagMap.set(video.contentId, tags)
            }
          }
        })
      }
      
    } catch (error) {
      console.warn(`Error fetching tags for batch ${i}:`, error)
      continue
    }
    
    // Rate limiting
    if (i + batchSize < videoIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  return tagMap
}

// Alternative approach: Search for individual videos
export async function fetchVideoTagsIndividual(videoIds: string[]): Promise<Map<string, string[]>> {
  const tagMap = new Map<string, string[]>()
  
  for (const videoId of videoIds) {
    try {
      const params = new URLSearchParams({
        q: videoId,
        targets: 'title',
        fields: 'contentId,tags,categoryTags',
        _limit: '10'
      })
      
      const fullUrl = `${SNAPSHOT_API_URL}?${params}`
      
      const response = await fetch(fullUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json'
        }
      })
      
      if (!response.ok) {
        continue
      }
      
      const data: SnapshotAPIResponse = await response.json()
      
      if (data.data && Array.isArray(data.data)) {
        const videoData = data.data.find(v => v.contentId === videoId)
        if (videoData) {
          const tags = parseTagString(videoData.tags)
          if (tags.length > 0) {
            tagMap.set(videoId, tags)
          }
        }
      }
      
    } catch (error) {
      console.warn(`Error fetching tags for ${videoId}:`, error)
      continue
    }
    
    // Rate limiting for individual requests
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  
  return tagMap
}

// Enhanced enrichment function that tries multiple methods
export async function enrichRankingItemsWithEnhancedTags(
  items: RankingItem[], 
  fallbackHtml?: string
): Promise<RankingItem[]> {
  const videoIds = items.map(item => item.id)
  
  // Method 1: Try batch API approach
  let tagMap = await fetchVideoTagsBatch(videoIds)
  
  // Method 2: If batch approach didn't get enough results, try individual approach
  const missingIds = videoIds.filter(id => !tagMap.has(id))
  if (missingIds.length > 0 && missingIds.length <= 10) {
    // Fetching individual tags for missing videos
    const individualTags = await fetchVideoTagsIndividual(missingIds)
    
    // Merge results
    individualTags.forEach((tags, id) => {
      tagMap.set(id, tags)
    })
  }
  
  // Method 3: Fallback to HTML parsing if provided
  if (fallbackHtml && tagMap.size === 0) {
    // Falling back to HTML tag extraction
    // You can import and use the existing HTML tag extractor here
  }
  
  // Apply tags to ranking items
  return items.map(item => ({
    ...item,
    tags: tagMap.get(item.id) || item.tags || []
  }))
}

// Test function to validate tag extraction
export async function testTagExtraction(testVideoIds: string[] = ['sm15630734', 'sm1097445']) {
  // Testing enhanced tag extraction...
  
  const tagMap = await fetchVideoTagsBatch(testVideoIds)
  
  // Results:
  testVideoIds.forEach(id => {
    const tags = tagMap.get(id) || []
    // Video tags extracted
  })
  
  return tagMap
}