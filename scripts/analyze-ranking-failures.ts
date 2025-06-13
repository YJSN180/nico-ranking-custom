#!/usr/bin/env npx tsx
import 'dotenv/config'
import type { RankingGenre } from '../types/ranking-config'

// Helper to fetch with Googlebot UA
async function fetchWithGooglebot(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja',
      'Cookie': 'sensitive_material_status=accept'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText} for URL: ${url}`);
  }
  
  return response;
}

// Extract server-response data from HTML
function extractServerResponseData(html: string): any {
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/);
  if (!metaMatch || !metaMatch[1]) {
    throw new Error('server-responseメタタグが見つかりません');
  }
  
  const encodedData = metaMatch[1];
  const decodedData = encodedData
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
  
  return JSON.parse(decodedData);
}

// All 23 genres
const ALL_GENRES: RankingGenre[] = [
  'all', 'game', 'anime', 'vocaloid', 'voicesynthesis',
  'entertainment', 'music', 'sing', 'dance', 'play',
  'commentary', 'cooking', 'travel', 'nature', 'vehicle',
  'technology', 'society', 'mmd', 'vtuber', 'radio',
  'sports', 'animal', 'other'
];

// Genre ID mapping
const GENRE_ID_MAP: Record<RankingGenre, string> = {
  all: 'e9uj2uks',
  game: '4eet3ca4',
  anime: 'zc49b03a',
  vocaloid: 'dshv5do5',
  voicesynthesis: 'e2bi9pt8',
  entertainment: '8kjl94d9',
  music: 'wq76qdin',
  sing: '1ya6bnqd',
  dance: '6yuf530c',
  play: '6r5jr8nd',
  commentary: 'v6wdx6p5',
  cooking: 'lq8d5918',
  travel: 'k1libcse',
  nature: '24aa8fkw',
  vehicle: '3d8zlls9',
  technology: 'n46kcz9u',
  society: 'lzicx0y6',
  mmd: 'p1acxuoz',
  vtuber: '6mkdo4xd',
  radio: 'oxzi6bje',
  sports: '4w3p65pf',
  animal: 'ne72lua2',
  other: 'ramuboyn'
};

interface TestResult {
  genre: RankingGenre
  period: '24h' | 'hour'
  success: boolean
  error?: string
  itemCount?: number
  responseTime: number
}

async function testSingleFetch(genre: RankingGenre, period: '24h' | 'hour'): Promise<TestResult> {
  const startTime = Date.now()
  const genreId = GENRE_ID_MAP[genre]
  const url = `https://www.nicovideo.jp/ranking/genre/${genreId}?term=${period}`
  
  try {
    const response = await fetchWithGooglebot(url)
    const html = await response.text()
    const serverData = extractServerResponseData(html)
    const rankingData = serverData.data?.response?.$getTeibanRanking?.data
    
    if (!rankingData) {
      throw new Error('ランキングデータが見つかりません')
    }
    
    return {
      genre,
      period,
      success: true,
      itemCount: rankingData.items?.length || 0,
      responseTime: Date.now() - startTime
    }
  } catch (error: any) {
    return {
      genre,
      period,
      success: false,
      error: error.message,
      responseTime: Date.now() - startTime
    }
  }
}

async function testWithDelay(tasks: (() => Promise<TestResult>)[], delayMs: number): Promise<TestResult[]> {
  const results: TestResult[] = []
  
  for (const task of tasks) {
    results.push(await task())
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  
  return results
}

async function main() {
  console.log('=== Nico Ranking Failure Analysis ===')
  console.log(`Testing ${ALL_GENRES.length} genres × 2 periods = ${ALL_GENRES.length * 2} endpoints`)
  console.log('')
  
  // Test different delay strategies
  const delayStrategies = [
    { name: 'No delay', delayMs: 0 },
    { name: '500ms delay', delayMs: 500 },
    { name: '1000ms delay', delayMs: 1000 },
    { name: '2000ms delay', delayMs: 2000 }
  ]
  
  for (const strategy of delayStrategies) {
    console.log(`\n--- Testing with ${strategy.name} ---`)
    
    const tasks: (() => Promise<TestResult>)[] = []
    
    // Create tasks for all genre/period combinations
    for (const genre of ALL_GENRES) {
      tasks.push(() => testSingleFetch(genre, '24h'))
      tasks.push(() => testSingleFetch(genre, 'hour'))
    }
    
    const startTime = Date.now()
    const results = await testWithDelay(tasks, strategy.delayMs)
    const totalTime = Date.now() - startTime
    
    // Analyze results
    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length
    const successRate = (successCount / results.length * 100).toFixed(1)
    
    // Group by period
    const results24h = results.filter(r => r.period === '24h')
    const resultsHour = results.filter(r => r.period === 'hour')
    
    const success24h = results24h.filter(r => r.success).length
    const successHour = resultsHour.filter(r => r.success).length
    
    console.log(`\nResults:`)
    console.log(`  Total time: ${(totalTime / 1000).toFixed(1)}s`)
    console.log(`  Success rate: ${successRate}% (${successCount}/${results.length})`)
    console.log(`  24h success: ${success24h}/${ALL_GENRES.length} genres`)
    console.log(`  Hour success: ${successHour}/${ALL_GENRES.length} genres`)
    
    // Show failed genres
    const failed24h = results24h.filter(r => !r.success).map(r => r.genre)
    const failedHour = resultsHour.filter(r => !r.success).map(r => r.genre)
    
    if (failed24h.length > 0) {
      console.log(`  Failed 24h genres: ${failed24h.join(', ')}`)
    }
    if (failedHour.length > 0) {
      console.log(`  Failed hour genres: ${failedHour.join(', ')}`)
    }
    
    // Show error types
    const errorTypes = new Map<string, number>()
    results.filter(r => !r.success).forEach(r => {
      const error = r.error || 'Unknown error'
      errorTypes.set(error, (errorTypes.get(error) || 0) + 1)
    })
    
    if (errorTypes.size > 0) {
      console.log(`\n  Error breakdown:`)
      errorTypes.forEach((count, error) => {
        console.log(`    ${error}: ${count} times`)
      })
    }
    
    // If we achieved 100% success, stop testing
    if (successCount === results.length) {
      console.log(`\n✅ Achieved 100% success rate with ${strategy.name}!`)
      break
    }
  }
  
  // Test concurrent batches with delays between batches
  console.log('\n\n--- Testing batch strategy (simulating workflow groups) ---')
  
  const batchSizes = [2, 3, 4, 6, 8]
  
  for (const batchSize of batchSizes) {
    console.log(`\nTesting with ${batchSize} concurrent batches:`)
    
    const genresPerBatch = Math.ceil(ALL_GENRES.length / batchSize)
    const batches: RankingGenre[][] = []
    
    for (let i = 0; i < batchSize; i++) {
      const start = i * genresPerBatch
      const end = Math.min(start + genresPerBatch, ALL_GENRES.length)
      batches.push(ALL_GENRES.slice(start, end))
    }
    
    const startTime = Date.now()
    const batchResults: TestResult[][] = []
    
    // Process batches with delay between them
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      console.log(`  Processing batch ${i + 1}/${batchSize}: ${batch.join(', ')}`)
      
      // Create tasks for this batch
      const batchTasks: Promise<TestResult>[] = []
      for (const genre of batch) {
        batchTasks.push(testSingleFetch(genre, '24h'))
        batchTasks.push(testSingleFetch(genre, 'hour'))
      }
      
      // Run batch concurrently
      const results = await Promise.all(batchTasks)
      batchResults.push(results)
      
      // Delay between batches
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    const totalTime = Date.now() - startTime
    const allResults = batchResults.flat()
    
    const successCount = allResults.filter(r => r.success).length
    const successRate = (successCount / allResults.length * 100).toFixed(1)
    
    console.log(`  Total time: ${(totalTime / 1000).toFixed(1)}s`)
    console.log(`  Success rate: ${successRate}% (${successCount}/${allResults.length})`)
    
    if (successCount === allResults.length) {
      console.log(`\n✅ Achieved 100% success with ${batchSize} batches!`)
      break
    }
  }
}

if (require.main === module) {
  main().catch(console.error)
}