import { NextResponse } from 'next/server'

export async function GET() {
  const results: any = {}
  
  // Test 1: Try to get a session/cookie from the main page
  try {
    const mainPageResponse = await fetch('https://www.nicovideo.jp/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.9'
      }
    })
    
    const cookies = mainPageResponse.headers.getAll('set-cookie')
    results.mainPageCookies = {
      status: mainPageResponse.status,
      cookies: cookies.map(c => c.split(';')[0]), // Get just the cookie name=value
      hasCookies: cookies.length > 0
    }
    
    // Extract any session-related cookies
    const sessionCookies = cookies.filter(c => 
      c.includes('session') || c.includes('auth') || c.includes('token')
    )
    
    // Test 2: Try ranking API with extracted cookies
    if (cookies.length > 0) {
      const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ')
      
      const rankingWithCookies = await fetch('https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'Referer': 'https://www.nicovideo.jp/',
          'Cookie': cookieHeader
        }
      })
      
      let itemCount = 0
      if (rankingWithCookies.ok) {
        const data = await rankingWithCookies.json()
        itemCount = data.data?.items?.length || 0
      }
      
      results.rankingWithCookies = {
        status: rankingWithCookies.status,
        itemCount,
        usedCookies: cookieHeader.substring(0, 100) + '...'
      }
    }
  } catch (error) {
    results.cookieTest = {
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
  
  // Test 3: Try different authentication headers
  const authTests = [
    {
      name: 'with_bearer_token',
      headers: {
        'Authorization': 'Bearer dummy_token',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0'
      }
    },
    {
      name: 'with_api_key',
      headers: {
        'X-API-Key': 'dummy_api_key',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0'
      }
    },
    {
      name: 'with_niconico_headers',
      headers: {
        'X-Niconico-Session': 'dummy_session',
        'X-Niconico-User-Id': '12345',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0'
      }
    },
    {
      name: 'with_premium_flag',
      headers: {
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
        'X-Niconico-Premium': '1',
        'X-Niconico-Official': '1'
      }
    }
  ]
  
  for (const test of authTests) {
    try {
      const response = await fetch('https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.nicovideo.jp/',
          ...test.headers
        }
      })
      
      let itemCount = 0
      let hasRestrictedContent = false
      
      if (response.ok) {
        const data = await response.json()
        itemCount = data.data?.items?.length || 0
        
        // Check if we got any videos that might be restricted
        if (data.data?.items) {
          const restrictedKeywords = ['ドッキリ', '静電気', 'パンツ', 'Gundam']
          hasRestrictedContent = data.data.items.some((item: any) => 
            restrictedKeywords.some(keyword => item.title?.includes(keyword))
          )
        }
      }
      
      results[test.name] = {
        status: response.status,
        itemCount,
        hasRestrictedContent
      }
    } catch (error) {
      results[test.name] = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
  
  // Test 4: Try web scraping approach with session
  try {
    // First, get the ranking page HTML
    const htmlResponse = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=24h', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.9'
      }
    })
    
    if (htmlResponse.ok) {
      const html = await htmlResponse.text()
      
      // Look for data embedded in the page
      const dataMatches = [
        { name: 'window.__INITIAL_DATA__', pattern: /window\.__INITIAL_DATA__\s*=\s*({[^;]+});/ },
        { name: 'data-state', pattern: /data-state="([^"]+)"/ },
        { name: 'data-api-data', pattern: /data-api-data="([^"]+)"/ },
        { name: 'Niconico.initialData', pattern: /Niconico\.initialData\s*=\s*({[^;]+});/ }
      ]
      
      const embeddedData: any = {}
      for (const match of dataMatches) {
        const result = html.match(match.pattern)
        if (result) {
          embeddedData[match.name] = {
            found: true,
            dataLength: result[1]?.length || 0,
            sample: result[1]?.substring(0, 100) + '...'
          }
        } else {
          embeddedData[match.name] = { found: false }
        }
      }
      
      results.webScrapingData = {
        htmlLength: html.length,
        embeddedData,
        hasRankingItems: html.includes('RankingVideo') || html.includes('ranking-item')
      }
    }
  } catch (error) {
    results.webScraping = {
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    tests: results
  })
}