import { NextRequest, NextResponse } from 'next/server'
import type { RankingGenre } from '@/types/ranking-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Compare different scraping methods to identify where sensitive videos are lost
export async function GET(request: Request | NextRequest) {
  const { searchParams } = new URL(request.url)
  const genre = (searchParams.get('genre') || 'all') as RankingGenre
  
  const results: any = {
    timestamp: new Date().toISOString(),
    genre,
    methods: {}
  }

  try {
    // Method 1: Direct HTML scraping with meta tag
    results.methods.htmlMeta = await scrapeHTMLMeta(genre)
    
    // Method 2: nvAPI only
    results.methods.nvAPI = await scrapeNvAPI(genre)
    
    // Method 3: Complete hybrid v1
    results.methods.hybridV1 = await scrapeHybridV1(genre)
    
    // Method 4: Complete hybrid v2
    results.methods.hybridV2 = await scrapeHybridV2(genre)
    
    // Method 5: Direct cookie scraper
    results.methods.cookieScraper = await scrapeCookie(genre)
    
    // Analysis
    results.analysis = analyzeResults(results.methods)
    
    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 'no-store',
      }
    })
  } catch (error) {
    results.error = {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }
    return NextResponse.json(results, { status: 500 })
  }
}

async function scrapeHTMLMeta(genre: string) {
  try {
    const url = `https://www.nicovideo.jp/ranking/genre/${genre}?term=24h`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.9',
        'Cookie': 'sensitive_material_status=accept',
        'X-Forwarded-For': '1.1.1.1'
      }
    })

    const html = await response.text()
    const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
    
    if (!metaMatch) {
      return { status: 'no-meta', totalItems: 0, sensitiveItems: 0 }
    }

    const encodedData = metaMatch[1]!
    const decodedData = encodedData
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
    
    const jsonData = JSON.parse(decodedData)
    const items = jsonData?.data?.response?.$getTeibanRanking?.data?.items || []
    
    const sensitiveItems = items.filter((item: any) => item.requireSensitiveMasking === true)
    const sensitiveIds = sensitiveItems.map((item: any) => item.id)

    return {
      status: 'success',
      totalItems: items.length,
      sensitiveItems: sensitiveItems.length,
      sensitiveIds,
      sampleSensitive: sensitiveItems.slice(0, 3).map((item: any) => ({
        id: item.id,
        title: item.title,
        sensitive: item.requireSensitiveMasking
      }))
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      totalItems: 0,
      sensitiveItems: 0
    }
  }
}

async function scrapeNvAPI(genre: string) {
  try {
    const url = `https://nvapi.nicovideo.jp/v1/ranking/genre/${genre}?term=24h`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
        'Referer': 'https://www.nicovideo.jp/',
      }
    })

    const data = await response.json()
    const items = data?.data?.items || []
    const itemIds = items.map((item: any) => item.id)

    return {
      status: 'success',
      totalItems: items.length,
      itemIds,
      note: 'nvAPI excludes sensitive videos'
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      totalItems: 0
    }
  }
}

async function scrapeHybridV1(genre: string) {
  try {
    const { completeHybridScrape } = await import('@/lib/complete-hybrid-scraper')
    const result = await completeHybridScrape(genre, '24h')
    
    const sensitiveItems = result.items.filter((item: any) => 
      item.requireSensitiveMasking || 
      item.title?.includes('♡') ||
      item.title?.includes('❤') ||
      item.title?.match(/R-?18/i)
    )

    return {
      status: 'success',
      totalItems: result.items.length,
      sensitiveItems: sensitiveItems.length,
      itemIds: result.items.map((item: any) => item.id),
      sampleSensitive: sensitiveItems.slice(0, 3).map((item: any) => ({
        id: item.id,
        title: item.title
      }))
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      totalItems: 0,
      sensitiveItems: 0
    }
  }
}

async function scrapeHybridV2(genre: string) {
  try {
    const { completeHybridScrapeV2 } = await import('@/lib/complete-hybrid-scraper-v2')
    const result = await completeHybridScrapeV2(genre, '24h')
    
    const sensitiveItems = result.items.filter((item: any) => 
      item.requireSensitiveMasking === true
    )

    return {
      status: 'success',
      totalItems: result.items.length,
      sensitiveItems: sensitiveItems.length,
      itemIds: result.items.map((item: any) => item.id),
      sensitiveIds: sensitiveItems.map((item: any) => item.id),
      sampleSensitive: sensitiveItems.slice(0, 3).map((item: any) => ({
        id: item.id,
        title: item.title,
        sensitive: item.requireSensitiveMasking
      }))
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      totalItems: 0,
      sensitiveItems: 0
    }
  }
}

async function scrapeCookie(genre: string) {
  try {
    const { cookieScrapeRanking } = await import('@/lib/cookie-scraper')
    const result = await cookieScrapeRanking(genre, '24h')
    
    const sensitiveItems = result.items.filter((item: any) => 
      item.requireSensitiveMasking || 
      item.title?.includes('♡') ||
      item.title?.includes('❤') ||
      item.title?.match(/R-?18/i)
    )

    return {
      status: 'success',
      totalItems: result.items.length,
      sensitiveItems: sensitiveItems.length,
      itemIds: result.items.map((item: any) => item.id),
      sampleSensitive: sensitiveItems.slice(0, 3).map((item: any) => ({
        id: item.id,
        title: item.title
      }))
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      totalItems: 0,
      sensitiveItems: 0
    }
  }
}

function analyzeResults(methods: any) {
  const analysis: any = {
    summary: {},
    sensitiveVideoComparison: {},
    missingVideos: {}
  }

  // Get reference from HTML meta (should have all videos including sensitive)
  const htmlMeta = methods.htmlMeta
  if (htmlMeta.status === 'success' && htmlMeta.sensitiveIds) {
    const referenceSensitiveIds = new Set(htmlMeta.sensitiveIds)
    
    // Check each method
    Object.entries(methods).forEach(([method, data]: [string, any]) => {
      if (data.status === 'success') {
        analysis.summary[method] = {
          total: data.totalItems,
          sensitive: data.sensitiveItems || 0,
          hasSensitive: (data.sensitiveItems || 0) > 0
        }
        
        // Check which sensitive videos are missing
        if (method !== 'htmlMeta' && data.itemIds) {
          const methodIds = new Set(data.itemIds)
          const missingSensitive = htmlMeta.sensitiveIds.filter((id: string) => !methodIds.has(id))
          
          if (missingSensitive.length > 0) {
            analysis.missingVideos[method] = {
              count: missingSensitive.length,
              ids: missingSensitive.slice(0, 5),
              percentage: ((missingSensitive.length / htmlMeta.sensitiveIds.length) * 100).toFixed(1) + '%'
            }
          }
        }
      }
    })
  }

  // Identify the issue
  analysis.diagnosis = {
    htmlMetaHasSensitive: (htmlMeta.sensitiveItems || 0) > 0,
    nvAPIExcludesSensitive: methods.nvAPI?.totalItems < htmlMeta.totalItems,
    hybridV2PreservesSensitive: (methods.hybridV2?.sensitiveItems || 0) > 0,
    possibleIssues: []
  }

  if (analysis.diagnosis.htmlMetaHasSensitive && !analysis.diagnosis.hybridV2PreservesSensitive) {
    analysis.diagnosis.possibleIssues.push('Hybrid V2 is not preserving sensitive videos from HTML')
  }

  if (methods.hybridV2?.sensitiveItems === 0 && htmlMeta.sensitiveItems > 0) {
    analysis.diagnosis.possibleIssues.push('Sensitive video detection in hybrid V2 might be broken')
  }

  return analysis
}