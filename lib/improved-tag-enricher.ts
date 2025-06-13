// Improved tag enrichment with better search strategies
import type { RankingItem } from '@/types/ranking'

const SNAPSHOT_API_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'
const USER_AGENT = 'nico-ranking-app/1.0'

interface SnapshotVideoData {
  contentId: string
  title: string
  tags?: string
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

// Strategy 1: Search by recent popular videos (works best for current content)
async function searchRecentPopular(videoIds: string[]): Promise<Map<string, string[]>> {
  const tagMap = new Map<string, string[]>()
  
  try {
    const params = new URLSearchParams({
      q: '*',
      targets: 'title',
      fields: 'contentId,title,tags,categoryTags',
      _sort: '-viewCounter',
      _limit: '100'
    })
    
    const response = await fetch(`${SNAPSHOT_API_URL}?${params}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    })
    
    if (response.ok) {
      const data: SnapshotAPIResponse = await response.json()
      
      if (data.data && Array.isArray(data.data)) {
        data.data.forEach(video => {
          if (videoIds.includes(video.contentId)) {
            const tags = parseTagString(video.tags)
            if (tags.length > 0) {
              tagMap.set(video.contentId, tags)
            }
          }
        })
      }
    }
  } catch (error) {
    console.warn('Recent popular search failed:', error)
  }
  
  return tagMap
}

// Strategy 2: Search by genre categories (for genre-specific content)
async function searchByGenre(videoIds: string[], genre: string): Promise<Map<string, string[]>> {
  const tagMap = new Map<string, string[]>()
  
  // Map common genres to search terms
  const genreSearchTerms: Record<string, string> = {
    'all': '*',
    'music_sound': 'VOCALOID',
    'game': 'ゲーム実況',
    'anime': 'アニメ',
    'entertainment': '歌ってみた',
    'voicesynthesis': 'VOCALOID'
  }
  
  const searchTerm = genreSearchTerms[genre] || '*'
  
  try {
    const params = new URLSearchParams({
      q: searchTerm,
      targets: 'tags',
      fields: 'contentId,title,tags,categoryTags',
      _sort: '-viewCounter',
      _limit: '100'
    })
    
    const response = await fetch(`${SNAPSHOT_API_URL}?${params}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    })
    
    if (response.ok) {
      const data: SnapshotAPIResponse = await response.json()
      
      if (data.data && Array.isArray(data.data)) {
        data.data.forEach(video => {
          if (videoIds.includes(video.contentId)) {
            const tags = parseTagString(video.tags)
            if (tags.length > 0) {
              tagMap.set(video.contentId, tags)
            }
          }
        })
      }
    }
  } catch (error) {
    console.warn('Genre search failed:', error)
  }
  
  return tagMap
}

// Strategy 3: Individual video search with title matching
async function searchIndividual(videoIds: string[]): Promise<Map<string, string[]>> {
  const tagMap = new Map<string, string[]>()
  
  for (const videoId of videoIds.slice(0, 10)) { // Limit to prevent rate limiting
    try {
      const params = new URLSearchParams({
        q: videoId,
        targets: 'title',
        fields: 'contentId,title,tags,categoryTags',
        _sort: '-viewCounter',
        _limit: '5'
      })
      
      const response = await fetch(`${SNAPSHOT_API_URL}?${params}`, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json'
        }
      })
      
      if (response.ok) {
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
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
      
    } catch (error) {
      console.warn(`Individual search failed for ${videoId}:`, error)
    }
  }
  
  return tagMap
}

// Multi-strategy tag enrichment
export async function enrichWithMultiStrategy(
  items: RankingItem[], 
  genre: string = 'all'
): Promise<RankingItem[]> {
  if (items.length === 0) {
    return items
  }
  
  const videoIds = items.filter(item => !item.tags || item.tags.length === 0).map(item => item.id)
  
  if (videoIds.length === 0) {
    return items // All items already have tags
  }
  
  let tagMap = new Map<string, string[]>()
  
  // Enriching videos without tags using multi-strategy approach
  
  // Strategy 1: Recent popular search (fast, works for current content)
  const recentTags = await searchRecentPopular(videoIds)
  recentTags.forEach((tags, id) => tagMap.set(id, tags))
  
  // Strategy 2: Genre-specific search (for remaining videos)
  const remainingIds = videoIds.filter(id => !tagMap.has(id))
  if (remainingIds.length > 0) {
    const genreTags = await searchByGenre(remainingIds, genre)
    genreTags.forEach((tags, id) => tagMap.set(id, tags))
  }
  
  // Strategy 3: Individual search (for final remaining videos, limited to prevent rate limiting)
  const stillRemainingIds = videoIds.filter(id => !tagMap.has(id))
  if (stillRemainingIds.length > 0 && stillRemainingIds.length <= 5) {
    const individualTags = await searchIndividual(stillRemainingIds)
    individualTags.forEach((tags, id) => tagMap.set(id, tags))
  }
  
  // Apply tags to items
  const enrichedItems = items.map(item => ({
    ...item,
    tags: (tagMap.get(item.id) ?? item.tags ?? []) as string[]
  }))
  
  const successCount = enrichedItems.filter(item => item.tags.length > 0).length
  // Multi-strategy enrichment complete
  
  return enrichedItems
}

// Fallback method using popular tags when specific video tags aren't available
export function applyFallbackTags(items: RankingItem[], genre: string, popularTags: string[]): RankingItem[] {
  if (popularTags.length === 0) {
    return items
  }
  
  // Apply genre tag and first popular tag to videos without any tags
  const fallbackTags = [genre === 'all' ? '動画' : genre, ...popularTags.slice(0, 2)]
  
  return items.map(item => {
    if (!item.tags || item.tags.length === 0) {
      return {
        ...item,
        tags: fallbackTags
      }
    }
    return item
  })
}