#!/usr/bin/env npx tsx
import 'dotenv/config'
import { getRankingFromKV, extractUniqueVideoIds } from './update-video-stats'
import { fetchVideoStats } from '../lib/snapshot-api'

async function testFullUpdate() {
  console.log('Testing full video stats update locally...')
  
  try {
    // 1. Fetch ranking data from KV
    console.log('\n1. Fetching ranking data from KV...')
    const rankingData = await getRankingFromKV()
    if (!rankingData) {
      console.error('No ranking data found in KV')
      return
    }
    
    // 2. Extract unique video IDs
    console.log('\n2. Extracting unique video IDs...')
    const videoIds = extractUniqueVideoIds(rankingData)
    console.log(`Found ${videoIds.length} unique videos`)
    
    // 3. Test with first 1000 videos
    const testSize = Math.min(1000, videoIds.length)
    const testIds = videoIds.slice(0, testSize)
    console.log(`\n3. Testing with first ${testSize} videos...`)
    
    // Enable debug logging
    process.env.DEBUG_SNAPSHOT_API = 'true'
    
    const startTime = Date.now()
    const stats = await fetchVideoStats(testIds)
    const elapsed = Date.now() - startTime
    
    console.log(`\n4. Results:`)
    console.log(`- Time taken: ${(elapsed / 1000).toFixed(1)}s`)
    console.log(`- Stats retrieved: ${Object.keys(stats).length}`)
    console.log(`- Success rate: ${((Object.keys(stats).length / testIds.length) * 100).toFixed(1)}%`)
    
    // Estimate full update time
    const estimatedFullTime = (elapsed / testSize) * videoIds.length
    console.log(`\n5. Estimated time for full update (${videoIds.length} videos): ${(estimatedFullTime / 1000 / 60).toFixed(1)} minutes`)
    
    // Show sample results
    const sampleIds = Object.keys(stats).slice(0, 5)
    if (sampleIds.length > 0) {
      console.log('\n6. Sample results:')
      sampleIds.forEach(id => {
        const stat = stats[id]
        console.log(`  ${id}: ${stat.viewCounter?.toLocaleString()} views, ${stat.commentCounter?.toLocaleString()} comments`)
      })
    }
    
  } catch (error) {
    console.error('Test failed:', error)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testFullUpdate()
}