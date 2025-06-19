#!/usr/bin/env npx tsx
import 'dotenv/config'
import { fetchVideoStats } from '../lib/snapshot-api'

async function testWithRealData() {
  console.log('Fetching real ranking data from nico-rank.com...')
  
  // Fetch the actual ranking page
  const response = await fetch('https://nico-rank.com/api/ranking?genre=other&tag=%E7%9C%9F%E5%A4%8F%E3%81%AE%E5%A4%9C%E3%81%AE%E6%B7%AB%E5%A4%A2&period=24h', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'application/json'
    }
  })
  
  if (!response.ok) {
    console.error('Failed to fetch ranking data:', response.status)
    return
  }
  
  const data = await response.json()
  console.log(`Total items in ranking: ${data.items?.length || 0}`)
  
  if (!data.items || data.items.length === 0) {
    console.error('No items found in ranking data')
    return
  }
  
  // Extract video IDs
  const videoIds = data.items.map((item: any) => item.id)
  console.log(`Video IDs extracted: ${videoIds.length}`)
  console.log('First 10 IDs:', videoIds.slice(0, 10))
  
  // Test with first 100 videos
  const testIds = videoIds.slice(0, 100)
  console.log(`\nTesting Snapshot API with ${testIds.length} videos...`)
  
  const startTime = Date.now()
  const stats = await fetchVideoStats(testIds)
  const elapsed = Date.now() - startTime
  
  console.log(`\nResults:`)
  console.log(`- Time taken: ${(elapsed / 1000).toFixed(1)}s`)
  console.log(`- Stats retrieved: ${Object.keys(stats).length}`)
  console.log(`- Success rate: ${((Object.keys(stats).length / testIds.length) * 100).toFixed(1)}%`)
  
  // Show some sample results
  const sampleIds = Object.keys(stats).slice(0, 5)
  console.log('\nSample results:')
  sampleIds.forEach(id => {
    const stat = stats[id]
    console.log(`- ${id}: ${stat.viewCounter?.toLocaleString()} views, ${stat.commentCounter?.toLocaleString()} comments`)
  })
  
  // Check for missing videos
  const missingIds = testIds.filter(id => !stats[id])
  if (missingIds.length > 0) {
    console.log(`\nMissing videos: ${missingIds.length}`)
    console.log('First 10 missing IDs:', missingIds.slice(0, 10))
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testWithRealData()
}