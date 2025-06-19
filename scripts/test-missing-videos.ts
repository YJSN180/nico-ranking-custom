#!/usr/bin/env npx tsx
import { fetchVideoStats } from '../lib/snapshot-api'

async function testMissingVideos() {
  // Recent video IDs that might be problematic
  const testCases = [
    // Very new videos (might not be indexed yet)
    ['sm45102533', 'sm45101941', 'sm45101831', 'sm45101342', 'sm45098083'],
    
    // Older videos that should exist
    ['sm9', 'sm500873', 'sm1097445', 'sm2057168', 'sm40233256'],
    
    // Mix of different ID ranges
    ['sm100', 'sm1000', 'sm10000', 'sm100000', 'sm1000000']
  ]
  
  console.log('Testing different types of video IDs...\n')
  
  for (const [index, videoIds] of testCases.entries()) {
    console.log(`Test case ${index + 1}: ${videoIds.join(', ')}`)
    
    const stats = await fetchVideoStats(videoIds)
    const retrieved = Object.keys(stats).length
    
    console.log(`Retrieved: ${retrieved}/${videoIds.length}`)
    
    // Show which ones failed
    const missing = videoIds.filter(id => !stats[id])
    if (missing.length > 0) {
      console.log(`Missing: ${missing.join(', ')}`)
    }
    
    console.log()
  }
  
  // Test with a single problematic video
  console.log('Testing individual fetch for a very new video...')
  const newVideoId = 'sm45102533'
  
  const response = await fetch(
    `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?q=${newVideoId}&targets=contentId&fields=contentId,title,viewCounter&_limit=10`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/json',
        'Accept-Language': 'ja'
      }
    }
  )
  
  const data = await response.json()
  console.log(`\nDirect API response for ${newVideoId}:`)
  console.log(`- Status: ${data.meta.status}`)
  console.log(`- Total count: ${data.meta.totalCount}`)
  console.log(`- Results: ${data.data?.length || 0}`)
  
  if (data.data && data.data.length > 0) {
    console.log(`- Found: ${data.data[0].contentId}`)
  } else {
    console.log('- Video not found in Snapshot API')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testMissingVideos()
}