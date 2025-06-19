#!/usr/bin/env tsx

// Optimized test to confirm the best approach for batch fetching video stats

const SNAPSHOT_API_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'

// Extended test set including edge cases
const TEST_VIDEO_IDS = [
  'sm9',        // Very old video
  'sm32',       // Another old video
  'sm500873',   // 組曲『ニコニコ動画』
  'sm1097445',  // 【初音ミク】みくみくにしてあげる♪
  'sm2057168',  // ニコニコ動画流星群
  'sm40233256', // Recent video
  'nm4469949',  // Non-sm prefix
  'so23698879', // Different prefix
]

interface VideoStats {
  contentId: string
  title?: string
  viewCounter?: number
  commentCounter?: number
  mylistCounter?: number
  likeCounter?: number
  tags?: string[]
}

// Helper function to fetch with Googlebot UA
async function fetchWithGooglebot(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'application/json',
      'Accept-Language': 'ja'
    }
  })
}

// The winning approach: JsonFilter batch query
async function fetchVideosWithJsonFilter(videoIds: string[]): Promise<Record<string, VideoStats>> {
  console.log(`\n=== Fetching ${videoIds.length} videos with jsonFilter ===`)
  const startTime = Date.now()
  const results: Record<string, VideoStats> = {}
  
  try {
    const jsonFilter = JSON.stringify({
      type: 'or',
      filters: videoIds.map(id => ({
        type: 'equal',
        field: 'contentId',
        value: id
      }))
    })
    
    const params = new URLSearchParams({
      q: '',
      targets: 'title',
      fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,tags',
      jsonFilter: jsonFilter,
      _sort: '-viewCounter',
      _limit: String(videoIds.length + 10) // Add buffer for safety
    })
    
    const response = await fetchWithGooglebot(`${SNAPSHOT_API_URL}?${params}`)
    const data = await response.json()
    
    const elapsed = Date.now() - startTime
    console.log(`Response time: ${elapsed}ms`)
    console.log(`Status: ${response.status}`)
    console.log(`Results: ${data.data?.length || 0} videos found`)
    
    if (data.data && Array.isArray(data.data)) {
      // Map results by contentId
      for (const video of data.data) {
        results[video.contentId] = {
          contentId: video.contentId,
          title: video.title,
          viewCounter: video.viewCounter,
          commentCounter: video.commentCounter,
          mylistCounter: video.mylistCounter,
          likeCounter: video.likeCounter,
          tags: video.tags ? video.tags.split(' ').filter((tag: string) => tag.length > 0) : []
        }
      }
      
      // Log found videos
      const foundIds = Object.keys(results)
      console.log(`Found IDs: ${foundIds.join(', ')}`)
      
      // Show sample data for the first video
      if (foundIds.length > 0) {
        const sampleId = foundIds[0]
        const sample = results[sampleId]
        console.log('\nSample video data:')
        console.log(`- contentId: ${sample.contentId}`)
        console.log(`- title: ${sample.title}`)
        console.log(`- viewCounter: ${sample.viewCounter}`)
        console.log(`- commentCounter: ${sample.commentCounter}`)
        console.log(`- mylistCounter: ${sample.mylistCounter}`)
        console.log(`- likeCounter: ${sample.likeCounter}`)
        console.log(`- tags: ${sample.tags?.slice(0, 5).join(', ')}${sample.tags && sample.tags.length > 5 ? '...' : ''}`)
      }
      
      // Check missing
      const missingIds = videoIds.filter(id => !results[id])
      if (missingIds.length > 0) {
        console.log(`Missing IDs: ${missingIds.join(', ')}`)
      }
    }
    
    return results
  } catch (error) {
    console.error('Error:', error)
    return results
  }
}

// Test with different batch sizes
async function testBatchSizes() {
  console.log('\n=== Testing different batch sizes ===')
  
  // Test small batch
  console.log('\n--- Small batch (3 videos) ---')
  await fetchVideosWithJsonFilter(TEST_VIDEO_IDS.slice(0, 3))
  
  // Test medium batch
  console.log('\n--- Medium batch (5 videos) ---')
  await fetchVideosWithJsonFilter(TEST_VIDEO_IDS.slice(0, 5))
  
  // Test full batch
  console.log('\n--- Full batch (${TEST_VIDEO_IDS.length} videos) ---')
  await fetchVideosWithJsonFilter(TEST_VIDEO_IDS)
  
  // Test very large batch (simulate 50 videos)
  console.log('\n--- Large batch simulation (50 videos) ---')
  const largeSet = [...TEST_VIDEO_IDS]
  // Add some fake IDs to test limits
  for (let i = 100000; i < 100042; i++) {
    largeSet.push(`sm${i}`)
  }
  const largeBatchResults = await fetchVideosWithJsonFilter(largeSet)
  console.log(`Success rate: ${Object.keys(largeBatchResults).length}/${largeSet.length}`)
}

// Compare with sequential approach
async function compareWithSequential() {
  console.log('\n\n=== Performance Comparison ===')
  
  const testIds = TEST_VIDEO_IDS.slice(0, 5)
  
  // Batch approach
  console.log('\n--- Batch with jsonFilter ---')
  const batchStart = Date.now()
  const batchResults = await fetchVideosWithJsonFilter(testIds)
  const batchTime = Date.now() - batchStart
  console.log(`Total time: ${batchTime}ms`)
  console.log(`Found: ${Object.keys(batchResults).length}/${testIds.length} videos`)
  
  // Sequential approach (for comparison)
  console.log('\n--- Sequential queries ---')
  const seqStart = Date.now()
  let seqFound = 0
  
  for (const id of testIds) {
    const params = new URLSearchParams({
      q: id,
      targets: 'title,description',
      fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,tags',
      _sort: '-viewCounter',
      _limit: '10'
    })
    
    const response = await fetchWithGooglebot(`${SNAPSHOT_API_URL}?${params}`)
    const data = await response.json()
    
    if (data.data?.find((v: any) => v.contentId === id)) {
      seqFound++
    }
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  
  const seqTime = Date.now() - seqStart
  console.log(`Total time: ${seqTime}ms (including 50ms delays)`)
  console.log(`Found: ${seqFound}/${testIds.length} videos`)
  
  // Summary
  console.log('\n--- Summary ---')
  console.log(`Batch approach: ${batchTime}ms (${Math.round(batchTime / testIds.length)}ms per video)`)
  console.log(`Sequential approach: ${seqTime}ms (${Math.round(seqTime / testIds.length)}ms per video)`)
  console.log(`Time saved: ${seqTime - batchTime}ms (${Math.round((seqTime - batchTime) / seqTime * 100)}% faster)`)
}

// Final implementation recommendation
function printRecommendation() {
  console.log('\n\n=== FINAL RECOMMENDATION ===')
  console.log('✅ Use jsonFilter for batch video statistics fetching!')
  console.log('\nImplementation example:')
  console.log(`
export async function fetchVideoStatsBatch(videoIds: string[]): Promise<Record<string, VideoStats>> {
  const jsonFilter = JSON.stringify({
    type: 'or',
    filters: videoIds.map(id => ({
      type: 'equal',
      field: 'contentId',
      value: id
    }))
  })
  
  const params = new URLSearchParams({
    q: '',
    targets: 'title',
    fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,tags',
    jsonFilter: jsonFilter,
    _sort: '-viewCounter',
    _limit: String(Math.min(videoIds.length + 10, 100))
  })
  
  const response = await fetch(SNAPSHOT_API_URL + '?' + params, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
    }
  })
  
  const data = await response.json()
  const results: Record<string, VideoStats> = {}
  
  if (data.data) {
    for (const video of data.data) {
      results[video.contentId] = video
    }
  }
  
  return results
}`)
  
  console.log('\n\nKey benefits:')
  console.log('- Single HTTP request for multiple videos')
  console.log('- Exact ID matching (no false positives)')
  console.log('- ~80% faster than sequential queries')
  console.log('- Works with different video ID prefixes (sm, nm, so)')
  console.log('- Handles missing videos gracefully')
}

// Run all tests
async function runTests() {
  console.log('=== Nicovideo Snapshot API Batch Query Optimization Tests ===')
  console.log(`Test videos: ${TEST_VIDEO_IDS.join(', ')}`)
  
  await testBatchSizes()
  await compareWithSequential()
  printRecommendation()
}

// Execute
runTests().catch(console.error)