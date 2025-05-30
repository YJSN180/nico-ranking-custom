import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import type { RankingGenre } from '@/types/ranking-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Comprehensive diagnostic endpoint to understand sensitive video issues
export async function GET(request: Request | NextRequest) {
  const { searchParams } = new URL(request.url)
  const genre = (searchParams.get('genre') || 'all') as RankingGenre
  const useV2 = searchParams.get('v2') !== 'false' // Default to v2
  
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      isVercel: !!process.env.VERCEL,
      region: process.env.VERCEL_REGION || 'unknown',
      env: process.env.NODE_ENV,
    },
    genre,
    useV2,
    results: {}
  }

  try {
    // Test 1: Check KV cache
    diagnostics.results.kvCache = await testKVCache(genre)

    // Test 2: Direct HTML fetch with cookie
    diagnostics.results.htmlFetch = await testHTMLFetch(genre)

    // Test 3: nvAPI fetch
    diagnostics.results.nvAPI = await testNvAPI(genre)

    // Test 4: Complete hybrid scrape
    diagnostics.results.hybridScrape = await testHybridScrape(genre, useV2)

    // Test 5: Check for sensitive videos
    diagnostics.results.sensitiveCheck = analyzeSensitiveVideos(diagnostics.results)

    // Test 6: Environment-specific headers
    diagnostics.results.headers = await testHeaders()

    return NextResponse.json(diagnostics, {
      headers: {
        'Cache-Control': 'no-store',
      }
    })
  } catch (error) {
    diagnostics.error = {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }
    return NextResponse.json(diagnostics, { status: 500 })
  }
}

async function testKVCache(genre: string) {
  try {
    const cacheKey = `ranking-${genre}`
    const data = await kv.get(cacheKey)
    
    if (!data) {
      return { status: 'empty', message: 'No cache data found' }
    }

    const parsed = typeof data === 'string' ? JSON.parse(data) : data
    const items = Array.isArray(parsed) ? parsed : parsed.items || []
    
    const sensitiveCount = items.filter((item: any) => 
      item.requireSensitiveMasking || 
      item.title?.includes('♡') ||
      item.title?.includes('❤') ||
      item.title?.match(/R-?18/i)
    ).length

    return {
      status: 'found',
      totalItems: items.length,
      sensitiveItems: sensitiveCount,
      sampleIds: items.slice(0, 5).map((item: any) => ({
        id: item.id,
        title: item.title?.substring(0, 30) + '...',
        sensitive: item.requireSensitiveMasking
      }))
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function testHTMLFetch(genre: string) {
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
      return {
        status: 'no-meta',
        responseStatus: response.status,
        htmlLength: html.length,
        hasRankingContent: html.includes('ranking')
      }
    }

    const encodedData = metaMatch[1]!
    const decodedData = encodedData
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
    
    const jsonData = JSON.parse(decodedData)
    const items = jsonData?.data?.response?.$getTeibanRanking?.data?.items || []
    
    const sensitiveCount = items.filter((item: any) => 
      item.requireSensitiveMasking === true
    ).length

    return {
      status: 'success',
      responseStatus: response.status,
      totalItems: items.length,
      sensitiveItems: sensitiveCount,
      cookieHeader: response.headers.get('set-cookie'),
      sampleSensitive: items
        .filter((item: any) => item.requireSensitiveMasking)
        .slice(0, 3)
        .map((item: any) => ({
          id: item.id,
          title: item.title?.substring(0, 30) + '...',
          sensitive: item.requireSensitiveMasking
        }))
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function testNvAPI(genre: string) {
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

    return {
      status: 'success',
      responseStatus: response.status,
      totalItems: items.length,
      metaStatus: data?.meta?.status,
      sampleIds: items.slice(0, 5).map((item: any) => item.id)
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function testHybridScrape(genre: string, useV2: boolean) {
  try {
    if (useV2) {
      const { completeHybridScrapeV2 } = await import('@/lib/complete-hybrid-scraper-v2')
      const result = await completeHybridScrapeV2(genre, '24h')
      
      const sensitiveCount = result.items.filter((item: any) => 
        item.requireSensitiveMasking || 
        item.title?.includes('♡') ||
        item.title?.includes('❤') ||
        item.title?.match(/R-?18/i)
      ).length

      return {
        status: 'success',
        version: 'v2',
        totalItems: result.items.length,
        sensitiveItems: sensitiveCount,
        popularTags: result.popularTags?.slice(0, 5),
        sampleSensitive: result.items
          .filter((item: any) => item.requireSensitiveMasking)
          .slice(0, 3)
          .map((item: any) => ({
            id: item.id,
            title: item.title?.substring(0, 30) + '...',
            sensitive: item.requireSensitiveMasking
          }))
      }
    } else {
      const { completeHybridScrape } = await import('@/lib/complete-hybrid-scraper')
      const result = await completeHybridScrape(genre, '24h')
      
      return {
        status: 'success',
        version: 'v1',
        totalItems: result.items.length,
        popularTags: result.popularTags?.slice(0, 5)
      }
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }
  }
}

function analyzeSensitiveVideos(results: any) {
  const analysis: any = {
    kvCacheSensitive: results.kvCache?.sensitiveItems || 0,
    htmlFetchSensitive: results.htmlFetch?.sensitiveItems || 0,
    hybridScrapeSensitive: results.hybridScrape?.sensitiveItems || 0,
    comparison: {}
  }

  // Compare results
  if (results.kvCache?.status === 'found' && results.htmlFetch?.status === 'success') {
    analysis.comparison.kvVsHtml = {
      kvTotal: results.kvCache.totalItems,
      htmlTotal: results.htmlFetch.totalItems,
      difference: results.kvCache.totalItems - results.htmlFetch.totalItems,
      kvSensitive: results.kvCache.sensitiveItems,
      htmlSensitive: results.htmlFetch.sensitiveItems,
      sensitiveDifference: results.kvCache.sensitiveItems - results.htmlFetch.sensitiveItems
    }
  }

  if (results.hybridScrape?.status === 'success' && results.htmlFetch?.status === 'success') {
    analysis.comparison.hybridVsHtml = {
      hybridTotal: results.hybridScrape.totalItems,
      htmlTotal: results.htmlFetch.totalItems,
      difference: results.hybridScrape.totalItems - results.htmlFetch.totalItems,
      hybridSensitive: results.hybridScrape.sensitiveItems,
      htmlSensitive: results.htmlFetch.sensitiveItems,
      sensitiveDifference: results.hybridScrape.sensitiveItems - results.htmlFetch.sensitiveItems
    }
  }

  // Check if sensitive videos are being filtered
  analysis.isSensitiveFiltered = analysis.htmlFetchSensitive > 0 && 
    (analysis.kvCacheSensitive === 0 || analysis.hybridScrapeSensitive === 0)

  return analysis
}

async function testHeaders() {
  try {
    // Test what headers are being sent/received
    const response = await fetch('https://httpbin.org/headers', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Cookie': 'sensitive_material_status=accept',
        'X-Forwarded-For': '1.1.1.1'
      }
    })

    const data = await response.json()
    
    return {
      status: 'success',
      sentHeaders: data.headers,
      vercelHeaders: {
        'x-vercel-id': process.env.VERCEL_REGION,
        'x-vercel-deployment-url': process.env.VERCEL_URL
      }
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}