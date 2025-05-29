import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint') || 'ranking'
  
  const results: any = {}
  
  // Common headers for all requests
  const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'ja,en;q=0.9',
    'Referer': 'https://www.nicovideo.jp/'
  }
  
  // Test different API versions and endpoints
  const apiTests = [
    {
      name: 'nvapi_v1_ranking_with_sensitive',
      url: 'https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h&_frontendId=6&_frontendVersion=0&includeR18=true&includeSensitive=true',
      headers: {
        ...baseHeaders,
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0'
      }
    },
    {
      name: 'nvapi_v2_ranking',
      url: 'https://nvapi.nicovideo.jp/v2/ranking/genre/all?term=24h',
      headers: {
        ...baseHeaders,
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0'
      }
    },
    {
      name: 'nvapi_v1_ranking_with_auth',
      url: 'https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h',
      headers: {
        ...baseHeaders,
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
        'X-Niconico-Session': 'dummy_session', // Test if session affects results
        'Cookie': 'user_session=dummy_session'
      }
    },
    {
      name: 'public_api_v2_snapshot',
      url: 'https://api.nicovideo.jp/api/v2/snapshot/video/contents/search?q=&targets=tagsExact&fields=contentId,title,viewCounter,thumbnailUrl&filters[startTime][gte]=2024-01-01T00:00:00%2B09:00&_sort=-viewCounter&_limit=200',
      headers: baseHeaders
    },
    {
      name: 'nvapi_popular_sensitive',
      url: 'https://nvapi.nicovideo.jp/v1/video/popular?term=24h&genre=all&sensitive=1',
      headers: {
        ...baseHeaders,
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0'
      }
    },
    {
      name: 'nvapi_ranking_mobile',
      url: 'https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'application/json',
        'X-Frontend-Id': '8', // Mobile frontend ID
        'X-Frontend-Version': '0',
        'Referer': 'https://sp.nicovideo.jp/'
      }
    },
    {
      name: 'nvapi_ranking_app',
      url: 'https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h',
      headers: {
        'User-Agent': 'NicoVideo-iOS/8.0.0',
        'Accept': 'application/json',
        'X-Frontend-Id': '1', // App frontend ID
        'X-Frontend-Version': '8.0.0',
        'X-Nicovideo-App-Version': '8.0.0'
      }
    }
  ]
  
  // Execute all tests
  for (const test of apiTests) {
    try {
      const response = await fetch(test.url, {
        headers: test.headers,
        credentials: 'omit'
      })
      
      const responseHeaders = Object.fromEntries(response.headers.entries())
      let data = null
      let itemCount = 0
      let sampleItems = []
      
      if (response.ok) {
        const text = await response.text()
        try {
          data = JSON.parse(text)
          
          // Extract item count based on response structure
          if (data.data?.items) {
            itemCount = data.data.items.length
            sampleItems = data.data.items.slice(0, 5).map((item: any) => ({
              id: item.id || item.contentId,
              title: item.title,
              sensitive: item.sensitive,
              requireSensitiveAuth: item.requireSensitiveAuth,
              deviceFilter: item.deviceFilter
            }))
          } else if (Array.isArray(data.data)) {
            itemCount = data.data.length
            sampleItems = data.data.slice(0, 5)
          }
        } catch (e) {
          data = { parseError: true, textLength: text.length }
        }
      }
      
      results[test.name] = {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        itemCount,
        sampleItems,
        hasData: !!data,
        error: null
      }
    } catch (error) {
      results[test.name] = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
  
  // Test specific video IDs that are missing
  const missingVideoIds = ['sm44197856', 'sm44205605'] // The Gundam and static electricity videos
  const videoTests: any = {}
  
  for (const videoId of missingVideoIds) {
    const videoResults: any = {}
    
    // Test different video detail endpoints
    const videoEndpoints = [
      {
        name: 'nvapi_v1_video',
        url: `https://nvapi.nicovideo.jp/v1/video/${videoId}`,
        headers: {
          ...baseHeaders,
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0'
        }
      },
      {
        name: 'nvapi_v1_video_with_sensitive',
        url: `https://nvapi.nicovideo.jp/v1/video/${videoId}?sensitive=1&withSensitive=true`,
        headers: {
          ...baseHeaders,
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0'
        }
      },
      {
        name: 'public_api_watch',
        url: `https://www.nicovideo.jp/api/watch/v3/${videoId}?_frontendId=6&_frontendVersion=0`,
        headers: baseHeaders
      }
    ]
    
    for (const endpoint of videoEndpoints) {
      try {
        const response = await fetch(endpoint.url, {
          headers: endpoint.headers
        })
        
        let data = null
        if (response.ok) {
          data = await response.json()
        }
        
        videoResults[endpoint.name] = {
          status: response.status,
          found: response.ok,
          data: data ? {
            isPrivate: data.data?.video?.isPrivate,
            isDeleted: data.data?.video?.isDeleted,
            requireSensitiveAuth: data.data?.video?.requireSensitiveAuth,
            deviceFilter: data.data?.video?.deviceFilter,
            isR18: data.data?.video?.isR18,
            tags: data.data?.tag?.items?.map((t: any) => t.name)
          } : null
        }
      } catch (error) {
        videoResults[endpoint.name] = {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
    
    videoTests[videoId] = videoResults
  }
  
  return NextResponse.json({
    rankingEndpointTests: results,
    specificVideoTests: videoTests,
    timestamp: new Date().toISOString()
  })
}