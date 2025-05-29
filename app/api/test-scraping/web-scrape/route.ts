import { NextResponse } from 'next/server'

export async function GET() {
  const results: any = {}
  
  // Step 1: Get initial page and extract any CSRF tokens or session data
  try {
    const initialResponse = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=24h', {
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
    
    const html = await initialResponse.text()
    const cookies = initialResponse.headers.getAll('set-cookie')
    
    // Extract embedded JSON data
    const patterns = {
      apiData: /data-api-data="([^"]+)"/,
      initialState: /window\.__initial_state__\s*=\s*({[^;]+});/,
      rankingData: /window\.__RANKING_DATA__\s*=\s*({[^;]+});/,
      csrfToken: /data-csrf-token="([^"]+)"/,
      frontendId: /data-frontend-id="([^"]+)"/,
      frontendVersion: /data-frontend-version="([^"]+)"/
    }
    
    const extracted: any = {}
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = html.match(pattern)
      if (match) {
        extracted[key] = match[1]
        if (key.includes('Data') || key.includes('State')) {
          try {
            // Try to decode HTML entities and parse JSON
            const decoded = match[1]
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&#39;/g, "'")
            
            const parsed = JSON.parse(decoded)
            extracted[`${key}_parsed`] = {
              success: true,
              itemCount: parsed.items?.length || parsed.data?.items?.length || 0,
              sampleItem: parsed.items?.[0] || parsed.data?.items?.[0] || null
            }
          } catch (e) {
            extracted[`${key}_parsed`] = { success: false, error: 'Parse failed' }
          }
        }
      }
    }
    
    // Count ranking items in HTML
    const rankingItemCount = (html.match(/<li[^>]*class="[^"]*RankingMainVideo[^"]*"/g) || []).length
    const videoLinkCount = (html.match(/\/watch\/sm\d+/g) || []).length
    
    // Extract video IDs and titles directly from HTML
    const videoPattern = /<a[^>]+href="\/watch\/(sm\d+)"[^>]*>[\s\S]*?<img[^>]+alt="([^"]+)"/g
    const videos = []
    let match
    while ((match = videoPattern.exec(html)) !== null) {
      videos.push({
        id: match[1],
        title: match[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      })
    }
    
    results.htmlScraping = {
      status: initialResponse.status,
      htmlLength: html.length,
      cookies: cookies.map(c => c.split(';')[0].split('=')[0]), // Just cookie names
      extracted,
      rankingItemCount,
      videoLinkCount,
      videosFound: videos.length,
      top5Videos: videos.slice(0, 5),
      containsTargetVideos: {
        sm44197856: html.includes('sm44197856'),
        sm44205605: html.includes('sm44205605')
      }
    }
    
    // Step 2: If we found frontend ID/version, try API with those values
    if (extracted.frontendId || extracted.frontendVersion) {
      const apiResponse = await fetch('https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'X-Frontend-Id': extracted.frontendId || '6',
          'X-Frontend-Version': extracted.frontendVersion || '0',
          'Referer': 'https://www.nicovideo.jp/ranking/genre/all?term=24h',
          'Cookie': cookies.map(c => c.split(';')[0]).join('; ')
        }
      })
      
      if (apiResponse.ok) {
        const apiData = await apiResponse.json()
        results.apiWithExtractedData = {
          status: apiResponse.status,
          itemCount: apiData.data?.items?.length || 0,
          hasTargetVideos: {
            sm44197856: apiData.data?.items?.some((item: any) => item.id === 'sm44197856'),
            sm44205605: apiData.data?.items?.some((item: any) => item.id === 'sm44205605')
          }
        }
      }
    }
  } catch (error) {
    results.htmlScraping = {
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
  
  // Step 3: Try mobile web version
  try {
    const mobileResponse = await fetch('https://sp.nicovideo.jp/ranking/genre/all?term=24h', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja-JP,ja;q=0.9'
      }
    })
    
    if (mobileResponse.ok) {
      const mobileHtml = await mobileResponse.text()
      
      // Mobile site might have different structure
      const mobileVideoCount = (mobileHtml.match(/\/watch\/sm\d+/g) || []).length
      const hasMobileRanking = mobileHtml.includes('ranking') || mobileHtml.includes('ランキング')
      
      results.mobileScraping = {
        status: mobileResponse.status,
        htmlLength: mobileHtml.length,
        videoCount: mobileVideoCount,
        hasRankingContent: hasMobileRanking,
        containsTargetVideos: {
          sm44197856: mobileHtml.includes('sm44197856'),
          sm44205605: mobileHtml.includes('sm44205605')
        }
      }
    }
  } catch (error) {
    results.mobileScraping = {
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
  
  // Step 4: Try RSS feed parsing for comparison
  try {
    const rssResponse = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=24h&rss=2.0&lang=ja-jp', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    })
    
    if (rssResponse.ok) {
      const rssText = await rssResponse.text()
      const rssVideoCount = (rssText.match(/<item>/g) || []).length
      
      results.rssFeed = {
        status: rssResponse.status,
        videoCount: rssVideoCount,
        containsTargetVideos: {
          sm44197856: rssText.includes('sm44197856'),
          sm44205605: rssText.includes('sm44205605')
        }
      }
    }
  } catch (error) {
    results.rssFeed = {
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    results
  })
}