import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import type { RankingGenre } from '@/types/ranking-config'
import { updateRankingData } from '@/lib/update-ranking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Test the cron job update process
export async function GET(request: Request | NextRequest) {
  const { searchParams } = new URL(request.url)
  const genre = (searchParams.get('genre') || 'all') as RankingGenre
  const simulate = searchParams.get('simulate') === 'true'
  
  const results: any = {
    timestamp: new Date().toISOString(),
    genre,
    simulate,
    steps: {}
  }

  try {
    // Step 1: Check current KV state
    results.steps.currentKV = await checkCurrentKV(genre)
    
    // Step 2: Run update process (simulate or real)
    if (simulate) {
      results.steps.updateSimulation = await simulateUpdate(genre)
    } else {
      results.steps.updateResult = await runUpdate(genre)
    }
    
    // Step 3: Check KV state after update
    results.steps.afterKV = await checkCurrentKV(genre)
    
    // Step 4: Compare before and after
    results.analysis = analyzeUpdate(results.steps)
    
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

async function checkCurrentKV(genre: string) {
  try {
    const cacheKey = `ranking-${genre}`
    const data = await kv.get(cacheKey)
    
    if (!data) {
      return { status: 'empty' }
    }

    const parsed = typeof data === 'string' ? JSON.parse(data) : data
    const items = Array.isArray(parsed) ? parsed : parsed.items || []
    
    const sensitiveCount = items.filter((item: any) => 
      item.requireSensitiveMasking === true
    ).length

    return {
      status: 'found',
      dataType: typeof data,
      structure: Array.isArray(parsed) ? 'array' : 'object',
      totalItems: items.length,
      sensitiveItems: sensitiveCount,
      ttl: await kv.ttl(cacheKey),
      sampleIds: items.slice(0, 5).map((item: any) => item.id),
      sampleSensitive: items
        .filter((item: any) => item.requireSensitiveMasking)
        .slice(0, 3)
        .map((item: any) => ({
          id: item.id,
          title: item.title?.substring(0, 30) + '...'
        }))
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function simulateUpdate(genre: string) {
  try {
    // Directly call the scraping function without saving to KV
    const { completeHybridScrapeV2 } = await import('@/lib/complete-hybrid-scraper-v2')
    const result = await completeHybridScrapeV2(genre, '24h')
    
    const sensitiveCount = result.items.filter((item: any) => 
      item.requireSensitiveMasking === true
    ).length

    return {
      status: 'success',
      method: 'completeHybridScrapeV2',
      totalItems: result.items.length,
      sensitiveItems: sensitiveCount,
      hasPopularTags: !!result.popularTags && result.popularTags.length > 0,
      dataStructure: 'items + popularTags',
      sampleSensitive: result.items
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

async function runUpdate(genre: string) {
  try {
    // Call the actual update function used by cron
    const result = await updateRankingData()
    
    // Check what was saved for this genre
    const cacheKey = `ranking-${genre}`
    const savedData = await kv.get(cacheKey)
    
    if (!savedData) {
      return {
        status: 'update-complete-but-no-data',
        updateResult: result
      }
    }

    const parsed = typeof savedData === 'string' ? JSON.parse(savedData) : savedData
    const items = Array.isArray(parsed) ? parsed : parsed.items || []
    
    const sensitiveCount = items.filter((item: any) => 
      item.requireSensitiveMasking === true
    ).length

    return {
      status: 'success',
      updateResult: result,
      savedDataType: typeof savedData,
      savedStructure: Array.isArray(parsed) ? 'array' : 'object',
      totalItems: items.length,
      sensitiveItems: sensitiveCount
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

function analyzeUpdate(steps: any) {
  const analysis: any = {
    kvDataChanged: false,
    sensitivePreserved: false,
    issues: []
  }

  if (steps.currentKV?.status === 'found' && steps.afterKV?.status === 'found') {
    analysis.kvDataChanged = steps.currentKV.totalItems !== steps.afterKV.totalItems
    analysis.sensitivePreserved = steps.afterKV.sensitiveItems > 0
    
    analysis.comparison = {
      before: {
        total: steps.currentKV.totalItems,
        sensitive: steps.currentKV.sensitiveItems
      },
      after: {
        total: steps.afterKV.totalItems,
        sensitive: steps.afterKV.sensitiveItems
      },
      difference: {
        total: steps.afterKV.totalItems - steps.currentKV.totalItems,
        sensitive: steps.afterKV.sensitiveItems - steps.currentKV.sensitiveItems
      }
    }
  }

  // Check simulation results
  if (steps.updateSimulation?.status === 'success') {
    analysis.simulationHasSensitive = steps.updateSimulation.sensitiveItems > 0
    
    if (analysis.simulationHasSensitive && steps.afterKV?.sensitiveItems === 0) {
      analysis.issues.push('Simulation finds sensitive videos but they are not saved to KV')
    }
  }

  // Identify issues
  if (steps.currentKV?.sensitiveItems > 0 && steps.afterKV?.sensitiveItems === 0) {
    analysis.issues.push('Sensitive videos were lost after update')
  }

  if (steps.updateSimulation?.sensitiveItems > 0 && steps.afterKV?.sensitiveItems === 0) {
    analysis.issues.push('Update process is not saving sensitive videos correctly')
  }

  return analysis
}