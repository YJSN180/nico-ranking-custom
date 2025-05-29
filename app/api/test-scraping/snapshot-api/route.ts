import { NextResponse } from 'next/server'

export async function GET() {
  const results: any = {}
  
  // Get date range for last 24 hours
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  
  // Format dates for API (JST timezone)
  const formatDate = (date: Date) => {
    const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000) // Add 9 hours for JST
    return jstDate.toISOString().replace('Z', '+09:00')
  }
  
  const startTime = formatDate(yesterday)
  const endTime = formatDate(now)
  
  // Test 1: Basic snapshot API request
  try {
    const baseUrl = 'https://api.nicovideo.jp/api/v2/snapshot/video/contents/search'
    const params = new URLSearchParams({
      q: '*',
      targets: 'tagsExact',
      fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnailUrl,startTime,lengthSeconds,channelId,tags,genre',
      filters: `[startTime][gte]=${startTime}`,
      _sort: '-viewCounter',
      _limit: '200',
      _context: 'apiguide'
    })
    
    const response = await fetch(`${baseUrl}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      results.basicSnapshot = {
        status: response.status,
        totalCount: data.meta?.totalCount,
        itemCount: data.data?.length || 0,
        sampleItems: data.data?.slice(0, 5).map((item: any) => ({
          id: item.contentId,
          title: item.title,
          views: item.viewCounter,
          tags: item.tags
        }))
      }
    } else {
      results.basicSnapshot = {
        status: response.status,
        error: await response.text()
      }
    }
  } catch (error) {
    results.basicSnapshot = {
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
  
  // Test 2: Search without time filter (all-time popular)
  try {
    const baseUrl = 'https://api.nicovideo.jp/api/v2/snapshot/video/contents/search'
    const params = new URLSearchParams({
      q: '*',
      targets: 'tagsExact',
      fields: 'contentId,title,viewCounter,thumbnailUrl,startTime,tags,genre',
      _sort: '-viewCounter',
      _limit: '200',
      _context: 'apiguide'
    })
    
    const response = await fetch(`${baseUrl}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      results.allTimePopular = {
        status: response.status,
        totalCount: data.meta?.totalCount,
        itemCount: data.data?.length || 0
      }
    }
  } catch (error) {
    results.allTimePopular = {
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
  
  // Test 3: Search for specific videos by ID
  const targetVideos = ['sm44197856', 'sm44205605'] // The missing videos
  
  for (const videoId of targetVideos) {
    try {
      const baseUrl = 'https://api.nicovideo.jp/api/v2/snapshot/video/contents/search'
      const params = new URLSearchParams({
        q: videoId,
        targets: 'contentId',
        fields: 'contentId,title,viewCounter,thumbnailUrl,startTime,tags,genre,channelId,description',
        _limit: '10',
        _context: 'apiguide'
      })
      
      const response = await fetch(`${baseUrl}?${params}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        results[`video_${videoId}`] = {
          found: data.data?.length > 0,
          data: data.data?.[0] || null
        }
      } else {
        results[`video_${videoId}`] = {
          status: response.status,
          error: await response.text()
        }
      }
    } catch (error) {
      results[`video_${videoId}`] = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
  
  // Test 4: Genre-specific ranking via snapshot API
  const genres = ['game', 'sing', 'vocaloid', 'dance', 'play']
  
  for (const genre of genres) {
    try {
      const baseUrl = 'https://api.nicovideo.jp/api/v2/snapshot/video/contents/search'
      const params = new URLSearchParams({
        q: genre,
        targets: 'genre',
        fields: 'contentId,title,viewCounter,thumbnailUrl,genre,tags',
        filters: `[startTime][gte]=${startTime}`,
        _sort: '-viewCounter',
        _limit: '100',
        _context: 'apiguide'
      })
      
      const response = await fetch(`${baseUrl}?${params}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        results[`genre_${genre}`] = {
          totalCount: data.meta?.totalCount,
          itemCount: data.data?.length || 0,
          topVideo: data.data?.[0] ? {
            id: data.data[0].contentId,
            title: data.data[0].title,
            views: data.data[0].viewCounter
          } : null
        }
      }
    } catch (error) {
      results[`genre_${genre}`] = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
  
  // Test 5: Combined approach - get all videos sorted by views
  try {
    const baseUrl = 'https://api.nicovideo.jp/api/v2/snapshot/video/contents/search'
    
    // First request without filters to get total
    const countParams = new URLSearchParams({
      q: '*',
      targets: 'tagsExact',
      fields: 'contentId',
      _limit: '1',
      _context: 'apiguide'
    })
    
    const countResponse = await fetch(`${baseUrl}?${countParams}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (countResponse.ok) {
      const countData = await countResponse.json()
      
      // Now get top videos with full fields
      const dataParams = new URLSearchParams({
        q: '*',
        targets: 'tagsExact',
        fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnailUrl,startTime,lengthSeconds,tags,genre,channelId',
        filters: `[viewCounter][gte]=10000`, // Only videos with 10k+ views
        _sort: '-startTime', // Sort by upload time to get recent popular videos
        _limit: '200',
        _context: 'apiguide'
      })
      
      const dataResponse = await fetch(`${baseUrl}?${dataParams}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (dataResponse.ok) {
        const fullData = await dataResponse.json()
        
        // Sort by views to create ranking
        const ranked = fullData.data?.sort((a: any, b: any) => b.viewCounter - a.viewCounter) || []
        
        results.combinedRanking = {
          totalVideosInDB: countData.meta?.totalCount,
          popularVideosCount: fullData.meta?.totalCount,
          top10: ranked.slice(0, 10).map((item: any, index: number) => ({
            rank: index + 1,
            id: item.contentId,
            title: item.title,
            views: item.viewCounter,
            uploadedAt: item.startTime
          }))
        }
      }
    }
  } catch (error) {
    results.combinedRanking = {
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    dateRange: { startTime, endTime },
    results
  })
}