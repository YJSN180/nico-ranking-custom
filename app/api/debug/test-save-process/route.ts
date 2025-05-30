import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import type { RankingGenre } from '@/types/ranking-config'
import { scrapeRankingPage, fetchPopularTags } from '@/lib/scraper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Test the exact save process used by update-ranking
export async function GET(request: Request | NextRequest) {
  const { searchParams } = new URL(request.url)
  const genre = (searchParams.get('genre') || 'all') as RankingGenre
  const dryRun = searchParams.get('dryRun') !== 'false' // Default to dry run
  
  const results: any = {
    timestamp: new Date().toISOString(),
    genre,
    dryRun,
    process: {}
  }

  try {
    // Step 1: Call scrapeRankingPage exactly as update-ranking does
    results.process.scrapeResult = await testScrapeRankingPage(genre)
    
    // Step 2: Fetch popular tags
    results.process.popularTags = await testFetchPopularTags(genre)
    
    // Step 3: Prepare data as update-ranking does
    results.process.preparedData = prepareDataForKV(
      results.process.scrapeResult,
      results.process.popularTags
    )
    
    // Step 4: Save to KV (or simulate)
    if (!dryRun) {
      results.process.saveResult = await saveToKV(genre, results.process.preparedData.data)
    }
    
    // Step 5: Read back from KV to verify
    results.process.kvVerification = await verifyKVData(genre)
    
    // Analysis
    results.analysis = analyzeProcess(results.process)
    
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

async function testScrapeRankingPage(genre: string) {
  try {
    // Call scrapeRankingPage and capture ALL returned data
    const fullResult = await scrapeRankingPage(genre, '24h')
    
    // Also destructure as update-ranking does
    const { items } = fullResult
    
    const sensitiveInFull = fullResult.items.filter((item: any) => 
      item.requireSensitiveMasking === true
    ).length
    
    const sensitiveInDestructured = items.filter((item: any) => 
      item.requireSensitiveMasking === true
    ).length

    return {
      status: 'success',
      fullResult: {
        hasItems: !!fullResult.items,
        hasPopularTags: !!fullResult.popularTags,
        totalItems: fullResult.items.length,
        sensitiveItems: sensitiveInFull,
        sampleItem: fullResult.items[0],
        sampleSensitive: fullResult.items
          .filter((item: any) => item.requireSensitiveMasking)
          .slice(0, 2)
          .map((item: any) => ({
            id: item.id,
            title: item.title?.substring(0, 30) + '...',
            sensitive: item.requireSensitiveMasking
          }))
      },
      destructuredResult: {
        totalItems: items.length,
        sensitiveItems: sensitiveInDestructured,
        itemsEqual: items === fullResult.items
      }
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function testFetchPopularTags(genre: string) {
  if (genre === 'all') {
    return { skipped: true, reason: 'all genre does not fetch popular tags' }
  }
  
  try {
    const tags = await fetchPopularTags(genre)
    return {
      status: 'success',
      count: tags.length,
      tags: tags.slice(0, 5)
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

function prepareDataForKV(scrapeResult: any, popularTagsResult: any) {
  if (scrapeResult.status !== 'success') {
    return { error: 'Scrape failed' }
  }
  
  // Exactly as update-ranking prepares data
  const { items } = scrapeResult.fullResult
  const popularTags = popularTagsResult.tags || []
  
  const dataToStore = {
    items,
    popularTags,
    updatedAt: new Date().toISOString()
  }
  
  const sensitiveCount = items.filter((item: any) => 
    item.requireSensitiveMasking === true
  ).length

  return {
    data: dataToStore,
    analysis: {
      structure: 'object with items and popularTags',
      itemCount: items.length,
      sensitiveCount,
      hasPopularTags: popularTags.length > 0,
      dataSize: JSON.stringify(dataToStore).length
    }
  }
}

async function saveToKV(genre: string, data: any) {
  try {
    const cacheKey = `ranking-${genre}`
    
    // Save exactly as update-ranking does
    await kv.set(cacheKey, data)
    await kv.expire(cacheKey, 3600)
    
    return {
      status: 'success',
      key: cacheKey,
      ttl: 3600
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function verifyKVData(genre: string) {
  try {
    const cacheKey = `ranking-${genre}`
    const data = await kv.get(cacheKey)
    
    if (!data) {
      return { status: 'not-found' }
    }

    const parsed = typeof data === 'string' ? JSON.parse(data) : data
    const items = Array.isArray(parsed) ? parsed : parsed.items || []
    
    const sensitiveCount = items.filter((item: any) => 
      item.requireSensitiveMasking === true
    ).length

    return {
      status: 'found',
      dataType: typeof data,
      isParsedObject: typeof parsed === 'object' && !Array.isArray(parsed),
      hasItems: 'items' in parsed,
      hasPopularTags: 'popularTags' in parsed,
      hasUpdatedAt: 'updatedAt' in parsed,
      totalItems: items.length,
      sensitiveItems: sensitiveCount,
      ttl: await kv.ttl(cacheKey)
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

function analyzeProcess(process: any) {
  const analysis: any = {
    dataPipeline: {},
    sensitiveVideoTracking: {},
    issues: []
  }

  // Track sensitive videos through the pipeline
  if (process.scrapeResult?.status === 'success') {
    const scrapeFullSensitive = process.scrapeResult.fullResult.sensitiveItems
    const scrapeDestructuredSensitive = process.scrapeResult.destructuredResult.sensitiveItems
    const preparedSensitive = process.preparedData?.analysis?.sensitiveCount || 0
    const kvSensitive = process.kvVerification?.sensitiveItems || 0
    
    analysis.sensitiveVideoTracking = {
      afterScraping: scrapeFullSensitive,
      afterDestructuring: scrapeDestructuredSensitive,
      inPreparedData: preparedSensitive,
      inKV: kvSensitive,
      preserved: kvSensitive === scrapeFullSensitive
    }
    
    if (scrapeFullSensitive > 0 && kvSensitive === 0) {
      analysis.issues.push('Sensitive videos found by scraping but not saved to KV')
    }
    
    if (scrapeFullSensitive !== scrapeDestructuredSensitive) {
      analysis.issues.push('Sensitive video count changed during destructuring')
    }
  }

  // Check data structure
  analysis.dataPipeline = {
    scrapeReturnedData: process.scrapeResult?.status === 'success',
    hasPopularTagsInScrape: process.scrapeResult?.fullResult?.hasPopularTags,
    preparedDataStructure: process.preparedData?.analysis?.structure,
    kvDataStructure: process.kvVerification?.isParsedObject ? 'object' : 'unknown',
    kvHasExpectedFields: process.kvVerification?.hasItems && process.kvVerification?.hasPopularTags
  }

  // Check for requireSensitiveMasking field
  if (process.scrapeResult?.fullResult?.sampleSensitive?.length > 0) {
    const sample = process.scrapeResult.fullResult.sampleSensitive[0]
    analysis.sensitiveFieldCheck = {
      hasRequireSensitiveMasking: 'sensitive' in sample,
      sampleValue: sample.sensitive
    }
  }

  return analysis
}