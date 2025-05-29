import { NextResponse } from 'next/server'

export async function GET() {
  const results: any = {}
  
  // Base headers for all requests
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'ja,en;q=0.9',
    'Referer': 'https://www.nicovideo.jp/'
  }
  
  // Test 1: Try different nvapi endpoints
  const nvapiEndpoints = [
    // Ranking variations
    { name: 'ranking_v1_full', url: 'https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h&_limit=200&_offset=0' },
    { name: 'ranking_v1_sensitive', url: 'https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h&sensitive=true' },
    { name: 'ranking_v1_all_params', url: 'https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h&withSensitive=1&includeR18=1&includeDeleted=1&includePrivate=1' },
    { name: 'ranking_v2', url: 'https://nvapi.nicovideo.jp/v2/ranking/genre/all?term=24h' },
    { name: 'ranking_v3', url: 'https://nvapi.nicovideo.jp/v3/ranking/genre/all?term=24h' },
    
    // Hot/trending endpoints
    { name: 'hot_videos', url: 'https://nvapi.nicovideo.jp/v1/hot/videos?genre=all' },
    { name: 'trending', url: 'https://nvapi.nicovideo.jp/v1/trending?genre=all' },
    { name: 'popular', url: 'https://nvapi.nicovideo.jp/v1/popular?genre=all&term=24h' },
    
    // Video list endpoints
    { name: 'video_list', url: 'https://nvapi.nicovideo.jp/v1/videos?genre=all&sort=viewCount&order=desc&limit=100' },
    { name: 'video_search', url: 'https://nvapi.nicovideo.jp/v1/search/video?q=*&targets=tagsExact&sort=-viewCounter&limit=100' },
    
    // Recommendation endpoints
    { name: 'recommend', url: 'https://nvapi.nicovideo.jp/v1/recommend?genre=all' },
    { name: 'related_ranking', url: 'https://nvapi.nicovideo.jp/v1/related/ranking?genre=all' }
  ]
  
  for (const endpoint of nvapiEndpoints) {
    try {
      const response = await fetch(endpoint.url, {
        headers: {
          ...headers,
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0'
        }
      })
      
      let itemCount = 0
      let hasData = false
      let sampleItem = null
      
      if (response.ok) {
        try {
          const data = await response.json()
          hasData = true
          
          // Try different data structures
          if (data.data?.items) {
            itemCount = data.data.items.length
            sampleItem = data.data.items[0]
          } else if (data.items) {
            itemCount = data.items.length
            sampleItem = data.items[0]
          } else if (Array.isArray(data.data)) {
            itemCount = data.data.length
            sampleItem = data.data[0]
          } else if (Array.isArray(data)) {
            itemCount = data.length
            sampleItem = data[0]
          }
        } catch (e) {
          // Not JSON
        }
      }
      
      results[endpoint.name] = {
        status: response.status,
        hasData,
        itemCount,
        sampleItem: sampleItem ? {
          id: sampleItem.id || sampleItem.contentId || sampleItem.videoId,
          title: sampleItem.title?.substring(0, 50)
        } : null
      }
    } catch (error) {
      results[endpoint.name] = { error: 'Failed' }
    }
  }
  
  // Test 2: Try different frontend IDs
  const frontendIds = [
    { id: '1', name: 'app' },
    { id: '2', name: 'unknown2' },
    { id: '3', name: 'unknown3' },
    { id: '4', name: 'unknown4' },
    { id: '5', name: 'unknown5' },
    { id: '6', name: 'web' },
    { id: '7', name: 'unknown7' },
    { id: '8', name: 'mobile' },
    { id: '9', name: 'unknown9' },
    { id: '10', name: 'unknown10' }
  ]
  
  results.frontendIdTests = {}
  for (const frontend of frontendIds) {
    try {
      const response = await fetch('https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h', {
        headers: {
          ...headers,
          'X-Frontend-Id': frontend.id,
          'X-Frontend-Version': '0'
        }
      })
      
      let itemCount = 0
      if (response.ok) {
        const data = await response.json()
        itemCount = data.data?.items?.length || 0
      }
      
      results.frontendIdTests[`${frontend.id}_${frontend.name}`] = {
        status: response.status,
        itemCount
      }
    } catch (error) {
      results.frontendIdTests[`${frontend.id}_${frontend.name}`] = { error: 'Failed' }
    }
  }
  
  // Test 3: Try public API endpoints
  const publicEndpoints = [
    { name: 'contents_search', url: 'https://api.nicovideo.jp/api/v2/snapshot/video/contents/search?q=*&targets=tagsExact&_sort=-viewCounter&_limit=100' },
    { name: 'watch_api', url: 'https://www.nicovideo.jp/api/watch/v3_guest/sm44197856' },
    { name: 'video_array', url: 'https://api.nicovideo.jp/v1/videos/array?videoIds=sm44197856,sm44205605' },
    { name: 'tag_search', url: 'https://api.nicovideo.jp/api/search/tag?tag=ゲーム&sort=view&order=desc' },
    { name: 'related_api', url: 'https://api.nicovideo.jp/api/related/sm44197856' }
  ]
  
  for (const endpoint of publicEndpoints) {
    try {
      const response = await fetch(endpoint.url, { headers })
      
      results[`public_${endpoint.name}`] = {
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type')
      }
      
      if (response.ok) {
        const text = await response.text()
        results[`public_${endpoint.name}`].dataLength = text.length
        
        try {
          const data = JSON.parse(text)
          results[`public_${endpoint.name}`].hasData = true
          results[`public_${endpoint.name}`].dataStructure = Object.keys(data).join(', ')
        } catch (e) {
          results[`public_${endpoint.name}`].isJson = false
        }
      }
    } catch (error) {
      results[`public_${endpoint.name}`] = { error: 'Failed' }
    }
  }
  
  // Test 4: Try legacy/deprecated endpoints
  const legacyEndpoints = [
    { name: 'getthumbinfo', url: 'https://ext.nicovideo.jp/api/getthumbinfo/sm44197856' },
    { name: 'old_api', url: 'https://api.nicovideo.jp/api/getflv?v=sm44197856' },
    { name: 'ce_api', url: 'https://api.ce.nicovideo.jp/api/v1/video.info?__format=json&v=sm44197856' },
    { name: 'nicoapi', url: 'https://api.ce.nicovideo.jp/nicoapi/v1/video.info?__format=json&v=sm44197856' }
  ]
  
  for (const endpoint of legacyEndpoints) {
    try {
      const response = await fetch(endpoint.url, { headers })
      
      results[`legacy_${endpoint.name}`] = {
        status: response.status,
        ok: response.ok
      }
      
      if (response.ok) {
        const text = await response.text()
        results[`legacy_${endpoint.name}`].dataLength = text.length
        results[`legacy_${endpoint.name}`].sample = text.substring(0, 100)
      }
    } catch (error) {
      results[`legacy_${endpoint.name}`] = { error: 'Failed' }
    }
  }
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    results
  })
}