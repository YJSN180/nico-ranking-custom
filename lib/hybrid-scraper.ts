// Hybrid scraper that combines multiple approaches to get complete ranking data
// including sensitive/device-restricted videos

import type { RankingItem } from '@/types/ranking'
import { scrapeRankingPage } from './scraper'
import { JSDOM } from 'jsdom'

interface HybridScraperOptions {
  genre: string
  term: '24h' | 'hour'
  tag?: string
  includeRestricted?: boolean
}

// Enhanced scraper that tries multiple methods to get complete data
export async function hybridScrapeRanking({
  genre,
  term,
  tag,
  includeRestricted = true
}: HybridScraperOptions): Promise<{
  items: RankingItem[]
  popularTags?: string[]
  source: 'nvapi' | 'hybrid' | 'webscrape'
}> {
  try {
    // Step 1: Get data from nvapi (primary source)
    const nvapiResult = await scrapeRankingPage(genre, term, tag)
    
    if (!includeRestricted || tag) {
      // If not including restricted content or using tag filter, nvapi is sufficient
      return {
        ...nvapiResult,
        items: nvapiResult.items as RankingItem[],
        source: 'nvapi'
      }
    }
    
    // Step 2: Check if we need to fetch additional data
    // by comparing with web scraping (for sensitive videos)
    const webData = await scrapeWebRanking(genre, term)
    
    if (webData.items.length === 0) {
      // Web scraping failed, return nvapi data
      return {
        ...nvapiResult,
        items: nvapiResult.items as RankingItem[],
        source: 'nvapi'
      }
    }
    
    // Step 3: Merge data - use web scraping order but enrich with nvapi data
    const nvapiMap = new Map(
      nvapiResult.items.map(item => [item.id!, item])
    )
    
    const mergedItems: RankingItem[] = []
    const missingIds: string[] = []
    
    // Process web-scraped items in order
    for (const webItem of webData.items) {
      const nvapiItem = nvapiMap.get(webItem.id)
      
      if (nvapiItem) {
        // Merge data, preferring nvapi data when available
        mergedItems.push({
          ...webItem,
          ...nvapiItem,
          rank: webItem.rank // Keep web scraping rank
        } as RankingItem)
      } else {
        // Item missing from nvapi (likely sensitive content)
        mergedItems.push(webItem)
        missingIds.push(webItem.id)
      }
    }
    
    // Step 4: Try to fetch additional data for missing videos
    if (missingIds.length > 0) {
      const additionalData = await fetchMissingVideos(missingIds)
      
      // Update merged items with additional data
      mergedItems.forEach((item, index) => {
        if (missingIds.includes(item.id)) {
          const additional = additionalData.get(item.id)
          if (additional) {
            mergedItems[index] = {
              ...item,
              ...additional
            }
          }
        }
      })
    }
    
    return {
      items: mergedItems,
      popularTags: nvapiResult.popularTags,
      source: 'hybrid'
    }
    
  } catch (error) {
    // If hybrid approach fails, try pure web scraping
    try {
      const webData = await scrapeWebRanking(genre, term)
      return {
        ...webData,
        source: 'webscrape'
      }
    } catch (webError) {
      // All methods failed, throw error
      throw new Error(`Hybrid scraping failed: ${error}`)
    }
  }
}

// Web scraping implementation
async function scrapeWebRanking(
  genre: string,
  term: '24h' | 'hour'
): Promise<{ items: RankingItem[], popularTags?: string[] }> {
  const url = `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}`
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    }
  })
  
  if (!response.ok) {
    throw new Error(`Web scraping failed: ${response.status}`)
  }
  
  const html = await response.text()
  const dom = new JSDOM(html)
  const document = dom.window.document
  
  const items: RankingItem[] = []
  
  // Try multiple selectors for ranking items
  const selectors = [
    '.RankingMainVideo',
    '.RankingVideo',
    '[class*="RankingVideo"]',
    '.ranking-item',
    'li[data-video-id]'
  ]
  
  let rankingElements: Element[] = []
  for (const selector of selectors) {
    rankingElements = Array.from(document.querySelectorAll(selector))
    if (rankingElements.length > 0) break
  }
  
  // Parse each ranking item
  rankingElements.forEach((element, index) => {
    try {
      // Extract video ID
      let videoId = ''
      const linkElement = element.querySelector('a[href*="/watch/"]')
      if (linkElement) {
        const href = linkElement.getAttribute('href') || ''
        const match = href.match(/watch\/(sm\d+|nm\d+|so\d+)/)
        if (match) videoId = match[1]
      }
      
      if (!videoId) {
        // Try data attributes
        videoId = element.getAttribute('data-video-id') || ''
      }
      
      if (!videoId) return
      
      // Extract title
      let title = ''
      const titleElement = element.querySelector('.VideoTitle, [class*="Title"], h3, h4')
      if (titleElement) {
        title = titleElement.textContent?.trim() || ''
      } else {
        // Try img alt attribute
        const imgElement = element.querySelector('img')
        if (imgElement) {
          title = imgElement.getAttribute('alt') || ''
        }
      }
      
      // Extract thumbnail
      let thumbURL = ''
      const imgElement = element.querySelector('img')
      if (imgElement) {
        thumbURL = imgElement.getAttribute('src') || 
                   imgElement.getAttribute('data-src') || 
                   imgElement.getAttribute('data-original') || ''
      }
      
      // Extract view count
      let views = 0
      const viewElements = [
        element.querySelector('.VideoMetaCount--view'),
        element.querySelector('[class*="view"]'),
        element.querySelector('.play')
      ]
      
      for (const viewElement of viewElements) {
        if (viewElement) {
          const text = viewElement.textContent || ''
          const match = text.match(/[\d,]+/)
          if (match) {
            views = parseInt(match[0].replace(/,/g, ''), 10)
            break
          }
        }
      }
      
      items.push({
        rank: index + 1,
        id: videoId,
        title: title.replace(/^第\d+位[：:]/, '').trim(),
        thumbURL,
        views
      })
    } catch (err) {
      // Skip invalid items
    }
  })
  
  // Extract popular tags if available
  const popularTags: string[] = []
  const tagElements = document.querySelectorAll('.PopularTag a, .tag-list a')
  tagElements.forEach(tagElement => {
    const tag = tagElement.textContent?.trim()
    if (tag && !popularTags.includes(tag)) {
      popularTags.push(tag)
    }
  })
  
  return {
    items: items.filter(item => item.id && item.title),
    popularTags: popularTags.slice(0, 20)
  }
}

// Fetch additional data for videos missing from nvapi
async function fetchMissingVideos(
  videoIds: string[]
): Promise<Map<string, Partial<RankingItem>>> {
  const results = new Map<string, Partial<RankingItem>>()
  
  // Use Snapshot API to get video data
  const baseUrl = 'https://api.nicovideo.jp/api/v2/snapshot/video/contents/search'
  const videoIdString = videoIds.join(' OR ')
  
  const params = new URLSearchParams({
    q: videoIdString,
    targets: 'contentId',
    fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnailUrl,startTime,tags',
    _limit: String(videoIds.length),
    _context: 'nicorankingapp'
  })
  
  try {
    const response = await fetch(`${baseUrl}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      
      if (data.data && Array.isArray(data.data)) {
        data.data.forEach((item: any) => {
          results.set(item.contentId, {
            id: item.contentId,
            title: item.title,
            thumbURL: item.thumbnailUrl?.large || item.thumbnailUrl?.middle || item.thumbnailUrl?.normal || '',
            views: item.viewCounter || 0,
            comments: item.commentCounter,
            mylists: item.mylistCounter,
            likes: item.likeCounter,
            tags: item.tags?.split(' ') || [],
            registeredAt: item.startTime
          })
        })
      }
    }
  } catch (error) {
    // Silently fail, we'll use the basic data we have
  }
  
  // For any still missing, try individual nvapi requests
  for (const videoId of videoIds) {
    if (!results.has(videoId)) {
      try {
        const response = await fetch(`https://nvapi.nicovideo.jp/v1/video/${videoId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'X-Frontend-Id': '6',
            'X-Frontend-Version': '0',
            'Referer': `https://www.nicovideo.jp/watch/${videoId}`
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          
          if (data.data?.video) {
            const video = data.data.video
            results.set(videoId, {
              id: videoId,
              title: video.title,
              thumbURL: video.thumbnail?.largeUrl || video.thumbnail?.url || '',
              views: video.count?.view || 0,
              comments: video.count?.comment,
              mylists: video.count?.mylist,
              likes: video.count?.like,
              registeredAt: video.registeredAt
            })
          }
        }
      } catch (error) {
        // Skip individual errors
      }
    }
  }
  
  return results
}