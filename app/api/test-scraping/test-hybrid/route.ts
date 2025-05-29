import { NextResponse } from 'next/server'
import { scrapeRankingPage } from '@/lib/scraper'
import { fetchNicoRanking } from '@/lib/fetch-rss'

// Simple web scraping without external dependencies
async function simpleWebScrape(genre: string, term: string) {
  const url = `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}`
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja,en;q=0.9'
    }
  })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status}`)
  }
  
  const html = await response.text()
  
  // Extract video data using regex
  const videoPattern = /<a[^>]+href="\/watch\/((?:sm|nm|so)\d+)"[^>]*>[\s\S]*?<img[^>]+alt="([^"]+)"[^>]*src="([^"]+)"/g
  const videos = []
  let match
  
  while ((match = videoPattern.exec(html)) !== null) {
    videos.push({
      id: match[1],
      title: match[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
      thumbURL: match[3]
    })
  }
  
  // Extract view counts
  const viewPattern = /<span[^>]+class="[^"]*VideoMetaCount[^"]*"[^>]*>[\s\S]*?([\d,]+)[\s\S]*?再生/g
  const viewCounts = []
  while ((match = viewPattern.exec(html)) !== null) {
    viewCounts.push(parseInt(match[1].replace(/,/g, ''), 10))
  }
  
  // Combine data
  return videos.map((video, index) => ({
    rank: index + 1,
    ...video,
    views: viewCounts[index] || 0
  }))
}

export async function GET() {
  try {
    const results: any = {
      timestamp: new Date().toISOString()
    }
    
    // Test 1: Compare all three sources
    const [nvapiData, rssData, webData] = await Promise.all([
      scrapeRankingPage('all', '24h').catch(err => ({ error: err.message, items: [] })),
      fetchNicoRanking('24h', 'all').catch(err => ({ error: err.message })),
      simpleWebScrape('all', '24h').catch(err => ({ error: err.message }))
    ])
    
    // Create comparison maps
    const nvapiMap = new Map(
      Array.isArray(nvapiData.items) ? nvapiData.items.map(item => [item.id, item]) : []
    )
    const rssMap = new Map(
      Array.isArray(rssData) ? rssData.map(item => [item.id, item]) : []
    )
    const webMap = new Map(
      Array.isArray(webData) ? webData.map(item => [item.id, item]) : []
    )
    
    // Find differences
    const allVideoIds = new Set([
      ...nvapiMap.keys(),
      ...rssMap.keys(),
      ...webMap.keys()
    ])
    
    const comparison: any[] = []
    const missingInNvapi: any[] = []
    const missingInRss: any[] = []
    const missingInWeb: any[] = []
    
    for (const videoId of allVideoIds) {
      const inNvapi = nvapiMap.has(videoId)
      const inRss = rssMap.has(videoId)
      const inWeb = webMap.has(videoId)
      
      const entry = {
        id: videoId,
        inNvapi,
        inRss,
        inWeb,
        nvapiRank: nvapiMap.get(videoId)?.rank,
        rssRank: rssMap.get(videoId)?.rank,
        webRank: webMap.get(videoId)?.rank,
        title: nvapiMap.get(videoId)?.title || rssMap.get(videoId)?.title || webMap.get(videoId)?.title
      }
      
      comparison.push(entry)
      
      if (!inNvapi && (inRss || inWeb)) {
        missingInNvapi.push(entry)
      }
      if (!inRss && (inNvapi || inWeb)) {
        missingInRss.push(entry)
      }
      if (!inWeb && (inNvapi || inRss)) {
        missingInWeb.push(entry)
      }
    }
    
    results.comparison = {
      totalVideos: allVideoIds.size,
      nvapiCount: nvapiMap.size,
      rssCount: rssMap.size,
      webCount: webMap.size,
      missingInNvapiCount: missingInNvapi.length,
      missingInRssCount: missingInRss.length,
      missingInWebCount: missingInWeb.length
    }
    
    results.missingInNvapi = missingInNvapi
    results.topDiscrepancies = comparison
      .filter(c => c.inNvapi && c.inRss && Math.abs((c.nvapiRank || 0) - (c.rssRank || 0)) > 5)
      .slice(0, 10)
    
    // Test 2: Check specific problematic videos
    const problematicIds = ['sm44197856', 'sm44205605']
    results.problematicVideos = {}
    
    for (const videoId of problematicIds) {
      const nvapiVideo = nvapiMap.get(videoId)
      const rssVideo = rssMap.get(videoId)
      const webVideo = webMap.get(videoId)
      
      results.problematicVideos[videoId] = {
        foundInNvapi: !!nvapiVideo,
        foundInRss: !!rssVideo,
        foundInWeb: !!webVideo,
        nvapiData: nvapiVideo || null,
        rssData: rssVideo || null,
        webData: webVideo || null
      }
      
      // Try to fetch directly via nvapi
      try {
        const directResponse = await fetch(`https://nvapi.nicovideo.jp/v1/video/${videoId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'X-Frontend-Id': '6',
            'X-Frontend-Version': '0',
            'Referer': `https://www.nicovideo.jp/watch/${videoId}`
          }
        })
        
        if (directResponse.ok) {
          const directData = await directResponse.json()
          results.problematicVideos[videoId].directFetch = {
            success: true,
            status: directData.meta?.status,
            video: directData.data?.video ? {
              title: directData.data.video.title,
              isPrivate: directData.data.video.isPrivate,
              isDeleted: directData.data.video.isDeleted,
              requireSensitiveAuth: directData.data.video.requireSensitiveAuth,
              deviceFilter: directData.data.video.deviceFilter
            } : null
          }
        } else {
          results.problematicVideos[videoId].directFetch = {
            success: false,
            status: directResponse.status
          }
        }
      } catch (error) {
        results.problematicVideos[videoId].directFetch = {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
    
    // Test 3: Hybrid approach simulation
    const hybridRanking: any[] = []
    const webVideos = Array.isArray(webData) ? webData : []
    
    for (const webVideo of webVideos) {
      const nvapiVideo = nvapiMap.get(webVideo.id)
      
      if (nvapiVideo) {
        // Merge data, prefer nvapi metadata
        hybridRanking.push({
          ...webVideo,
          ...nvapiVideo,
          rank: webVideo.rank, // Keep web scraping rank
          source: 'nvapi'
        })
      } else {
        // Use web data for missing videos
        hybridRanking.push({
          ...webVideo,
          source: 'web'
        })
      }
    }
    
    results.hybridApproach = {
      totalVideos: hybridRanking.length,
      fromNvapi: hybridRanking.filter(v => v.source === 'nvapi').length,
      fromWeb: hybridRanking.filter(v => v.source === 'web').length,
      top10: hybridRanking.slice(0, 10)
    }
    
    // Summary and recommendations
    results.summary = {
      canAccessAllVideos: webMap.size >= rssMap.size,
      nvapiMissingVideos: missingInNvapi.length > 0,
      webScrapingWorks: webMap.size > 0 && !webData.error,
      recommendation: webMap.size >= rssMap.size 
        ? 'Use web scraping as primary source or fallback for missing videos'
        : 'Continue using RSS until deprecated, then implement web scraping'
    }
    
    return NextResponse.json(results)
    
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}