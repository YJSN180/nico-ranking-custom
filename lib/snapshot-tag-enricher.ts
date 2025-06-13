// Snapshot API tag enrichment for ranking items
import type { RankingItem } from '@/types/ranking'

const SNAPSHOT_API_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'
const USER_AGENT = 'nico-ranking-app/1.0'
const BATCH_SIZE = 50 // Process videos in batches
const RATE_LIMIT_DELAY = 100 // ms between requests

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
  
  return tagString
    .split(' ')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
}

// Fetch tags for a batch of video IDs using general search
async function fetchTagsBatch(videoIds: string[]): Promise<Map<string, string[]>> {
  const tagMap = new Map<string, string[]>()
  
  if (videoIds.length === 0) {
    return tagMap
  }
  
  try {
    // Use a general search to find videos, then filter by our IDs
    const params = new URLSearchParams({
      q: '*', // Search all videos
      targets: 'title',
      fields: 'contentId,title,tags,categoryTags',
      _sort: '-viewCounter', // Sort by popularity
      _limit: '100' // Get more results to increase chance of finding our videos
    })
    
    const fullUrl = `${SNAPSHOT_API_URL}?${params}`
    
    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      console.warn(`Snapshot API batch request failed: ${response.status}`)
      return tagMap
    }
    
    const data: SnapshotAPIResponse = await response.json()
    
    if (data.data && Array.isArray(data.data)) {
      // Check each returned video to see if it matches our target IDs
      data.data.forEach(video => {
        if (videoIds.includes(video.contentId)) {
          const tags = parseTagString(video.tags)
          if (tags.length > 0) {
            tagMap.set(video.contentId, tags)
          }
        }
      })
    }
    
  } catch (error) {
    console.warn('Error in batch tag fetch:', error)
  }
  
  return tagMap
}

// Fetch tags for individual videos using targeted search
async function fetchTagsIndividual(videoIds: string[]): Promise<Map<string, string[]>> {
  const tagMap = new Map<string, string[]>()
  
  for (const videoId of videoIds) {
    try {
      // Search for this specific video
      const params = new URLSearchParams({
        q: `contentId:${videoId}`,
        targets: 'title',
        fields: 'contentId,title,tags,categoryTags',
        _sort: '-viewCounter',
        _limit: '1'
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
        const video = data.data.find(v => v.contentId === videoId)
        if (video && video.tags) {
          const tags = parseTagString(video.tags)
          if (tags.length > 0) {
            tagMap.set(videoId, tags)
          }
        }
      }
      
    } catch (error) {
      console.warn(`Error fetching tags for ${videoId}:`, error)
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY))
  }
  
  return tagMap
}

// Enhanced tag enrichment that tries multiple strategies
export async function enrichWithSnapshotTags(items: RankingItem[]): Promise<RankingItem[]> {
  if (items.length === 0) {
    return items
  }
  
  const videoIds = items.map(item => item.id)
  let tagMap = new Map<string, string[]>()
  
  // Strategy 1: Try batch fetch first (faster, but less reliable for older videos)
  // Fetching tags using batch method
  tagMap = await fetchTagsBatch(videoIds)
  
  // Strategy 2: For videos without tags, try individual fetch (slower, but more reliable)
  const missingIds = videoIds.filter(id => !tagMap.has(id))
  if (missingIds.length > 0 && missingIds.length <= 20) { // Only try individual for small numbers
    // Fetching tags individually for remaining videos
    const individualTags = await fetchTagsIndividual(missingIds)
    
    // Merge results
    individualTags.forEach((tags, id) => {
      tagMap.set(id, tags)
    })
  }
  
  // Apply tags to ranking items
  const enrichedItems = items.map(item => ({
    ...item,
    tags: (tagMap.get(item.id) ?? item.tags ?? []) as string[]
  }))
  
  const successCount = enrichedItems.filter(item => item.tags.length > 0).length
  // Tag enrichment completed
  
  return enrichedItems
}

// Lightweight tag enrichment for smaller sets or when performance is critical
export async function enrichWithSnapshotTagsLight(items: RankingItem[]): Promise<RankingItem[]> {
  if (items.length === 0 || items.length > 50) {
    return items // Skip for large sets
  }
  
  const videoIds = items.map(item => item.id)
  const tagMap = await fetchTagsBatch(videoIds)
  
  return items.map(item => ({
    ...item,
    tags: (tagMap.get(item.id) ?? item.tags ?? []) as string[]
  }))
}

// Test function
export async function testSnapshotTagEnrichment(testVideoIds: string[] = ['sm15630734', 'sm1097445']): Promise<void> {
  // Testing Snapshot tag enrichment
  
  const mockItems: RankingItem[] = testVideoIds.map((id, index) => ({
    rank: index + 1,
    id,
    title: `Test Video ${id}`,
    thumbURL: '',
    views: 1000,
    comments: 100,
    mylists: 50,
    likes: 200,
    tags: []
  }))
  
  const enriched = await enrichWithSnapshotTags(mockItems)
  
  enriched.forEach(item => {
    // Tags retrieved for test video
  })
}