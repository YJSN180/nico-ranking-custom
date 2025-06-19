#!/usr/bin/env tsx

// Test script to verify if Nicovideo Snapshot API can fetch multiple video statistics at once

const SNAPSHOT_API_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'

// Test video IDs (using some popular videos)
const TEST_VIDEO_IDS = [
  'sm9', // 新・豪血寺一族 -煩悩解放 - レッツゴー！陰陽師
  'sm32',
  'sm500873', // 組曲『ニコニコ動画』
  'sm1097445', // 【初音ミク】みくみくにしてあげる♪
  'sm2057168', // ニコニコ動画流星群
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
  console.log(`Request URL: ${url}`)
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'application/json',
      'Accept-Language': 'ja'
    }
  })
  
  // Log error response body for debugging
  if (!response.ok) {
    try {
      const errorText = await response.text()
      console.log(`Error response (${response.status}): ${errorText}`)
      // Create a new response with the same properties but we can read the body again
      return new Response(errorText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    } catch (e) {
      console.log(`Could not read error response`)
    }
  }
  
  return response
}

// Test 1: Single video ID query
async function testSingleVideoQuery(videoId: string): Promise<VideoStats | null> {
  console.log(`\n=== Test 1: Single video query (${videoId}) ===`)
  const startTime = Date.now()
  
  try {
    const params = new URLSearchParams({
      q: videoId,
      targets: 'title,description',
      fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,tags',
      _sort: '-viewCounter',
      _limit: '10'
    })
    
    const response = await fetchWithGooglebot(`${SNAPSHOT_API_URL}?${params}`)
    
    let data: any = {}
    try {
      data = await response.json()
    } catch (e) {
      console.log('Failed to parse JSON response')
    }
    
    const elapsed = Date.now() - startTime
    console.log(`Response time: ${elapsed}ms`)
    console.log(`Status: ${response.status}`)
    console.log(`Results count: ${data.data?.length || 0}`)
    
    if (data.data && data.data.length > 0) {
      const video = data.data.find((v: any) => v.contentId === videoId) || data.data[0]
      console.log(`Found video: ${video.contentId} - ${video.title}`)
      console.log(`Stats: views=${video.viewCounter}, comments=${video.commentCounter}, mylists=${video.mylistCounter}`)
      return video
    }
    
    console.log('No results found')
    return null
  } catch (error) {
    console.error('Error:', error)
    return null
  }
}

// Test 2: Multiple video IDs with OR operator
async function testOrOperatorQuery(videoIds: string[]): Promise<VideoStats[]> {
  console.log(`\n=== Test 2: OR operator query (${videoIds.join(' OR ')}) ===`)
  const startTime = Date.now()
  
  try {
    const query = videoIds.join(' OR ')
    const params = new URLSearchParams({
      q: query,
      targets: 'title',
      fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,tags',
      _sort: '-viewCounter',
      _limit: '100'
    })
    
    const response = await fetchWithGooglebot(`${SNAPSHOT_API_URL}?${params}`)
    
    let data: any = {}
    try {
      data = await response.json()
    } catch (e) {
      console.log('Failed to parse JSON response')
    }
    
    const elapsed = Date.now() - startTime
    console.log(`Response time: ${elapsed}ms`)
    console.log(`Status: ${response.status}`)
    console.log(`Results count: ${data.data?.length || 0}`)
    
    if (data.data && data.data.length > 0) {
      const foundIds = data.data.map((v: any) => v.contentId)
      console.log(`Found video IDs: ${foundIds.join(', ')}`)
      
      // Check which requested IDs were found
      const missingIds = videoIds.filter(id => !foundIds.includes(id))
      if (missingIds.length > 0) {
        console.log(`Missing IDs: ${missingIds.join(', ')}`)
      }
      
      return data.data
    }
    
    console.log('No results found')
    return []
  } catch (error) {
    console.error('Error:', error)
    return []
  }
}

// Test 3: Space-separated IDs
async function testSpaceSeparatedQuery(videoIds: string[]): Promise<VideoStats[]> {
  console.log(`\n=== Test 3: Space-separated query (${videoIds.join(' ')}) ===`)
  const startTime = Date.now()
  
  try {
    const query = videoIds.join(' ')
    const params = new URLSearchParams({
      q: query,
      targets: 'title',
      fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,tags',
      _sort: '-viewCounter',
      _limit: '100'
    })
    
    const response = await fetchWithGooglebot(`${SNAPSHOT_API_URL}?${params}`)
    
    let data: any = {}
    try {
      data = await response.json()
    } catch (e) {
      console.log('Failed to parse JSON response')
    }
    
    const elapsed = Date.now() - startTime
    console.log(`Response time: ${elapsed}ms`)
    console.log(`Status: ${response.status}`)
    console.log(`Results count: ${data.data?.length || 0}`)
    
    if (data.data && data.data.length > 0) {
      const foundIds = data.data.map((v: any) => v.contentId)
      console.log(`Found video IDs: ${foundIds.join(', ')}`)
      
      // Check which requested IDs were found
      const missingIds = videoIds.filter(id => !foundIds.includes(id))
      if (missingIds.length > 0) {
        console.log(`Missing IDs: ${missingIds.join(', ')}`)
      }
      
      return data.data
    }
    
    console.log('No results found')
    return []
  } catch (error) {
    console.error('Error:', error)
    return []
  }
}

// Test 4: Using exact match in description/title
async function testExactMatchQuery(videoIds: string[]): Promise<VideoStats[]> {
  console.log(`\n=== Test 4: Exact match query with quotes ===`)
  const startTime = Date.now()
  
  try {
    // Try with quoted IDs for exact match
    const query = videoIds.map(id => `"${id}"`).join(' OR ')
    const params = new URLSearchParams({
      q: query,
      targets: 'title,description',
      fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,tags',
      _sort: '-viewCounter',
      _limit: '100'
    })
    
    const response = await fetchWithGooglebot(`${SNAPSHOT_API_URL}?${params}`)
    
    let data: any = {}
    try {
      data = await response.json()
    } catch (e) {
      console.log('Failed to parse JSON response')
    }
    
    const elapsed = Date.now() - startTime
    console.log(`Response time: ${elapsed}ms`)
    console.log(`Status: ${response.status}`)
    console.log(`Results count: ${data.data?.length || 0}`)
    
    if (data.data && data.data.length > 0) {
      const foundIds = data.data.map((v: any) => v.contentId)
      console.log(`Found video IDs: ${foundIds.join(', ')}`)
      
      // Filter to only exact matches
      const exactMatches = data.data.filter((v: any) => videoIds.includes(v.contentId))
      console.log(`Exact matches: ${exactMatches.map((v: any) => v.contentId).join(', ')}`)
      
      return exactMatches
    }
    
    console.log('No results found')
    return []
  } catch (error) {
    console.error('Error:', error)
    return []
  }
}

// Test 5: Using jsonFilter parameter
async function testJsonFilterQuery(videoIds: string[]): Promise<VideoStats[]> {
  console.log(`\n=== Test 5: JsonFilter parameter query ===`)
  const startTime = Date.now()
  
  try {
    // Try using jsonFilter parameter with contentId
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
      _limit: '100'
    })
    
    const response = await fetchWithGooglebot(`${SNAPSHOT_API_URL}?${params}`)
    
    let data: any = {}
    try {
      data = await response.json()
    } catch (e) {
      console.log('Failed to parse JSON response')
    }
    
    const elapsed = Date.now() - startTime
    console.log(`Response time: ${elapsed}ms`)
    console.log(`Status: ${response.status}`)
    console.log(`Results count: ${data.data?.length || 0}`)
    
    if (data.data && data.data.length > 0) {
      const foundIds = data.data.map((v: any) => v.contentId)
      console.log(`Found video IDs: ${foundIds.join(', ')}`)
      return data.data
    }
    
    console.log('No results found')
    return []
  } catch (error) {
    console.error('Error:', error)
    return []
  }
}

// Test 6: Sequential single queries (baseline for comparison)
async function testSequentialQueries(videoIds: string[]): Promise<VideoStats[]> {
  console.log(`\n=== Test 6: Sequential single queries (baseline) ===`)
  const startTime = Date.now()
  const results: VideoStats[] = []
  
  for (const videoId of videoIds) {
    try {
      const params = new URLSearchParams({
        q: videoId,
        targets: 'title,description',
        fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,tags',
        _sort: '-viewCounter',
        _limit: '10'
      })
      
      const response = await fetchWithGooglebot(`${SNAPSHOT_API_URL}?${params}`)
      
      let data: any = {}
      try {
        data = await response.json()
      } catch (e) {
        console.log('Failed to parse JSON response')
      }
      
      if (data.data && data.data.length > 0) {
        const video = data.data.find((v: any) => v.contentId === videoId) || data.data[0]
        if (video) {
          results.push(video)
          console.log(`Found: ${video.contentId} - ${video.title?.substring(0, 50)}...`)
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50))
    } catch (error) {
      console.error(`Error fetching ${videoId}:`, error)
    }
  }
  
  const elapsed = Date.now() - startTime
  console.log(`Total response time: ${elapsed}ms`)
  console.log(`Average per video: ${Math.round(elapsed / videoIds.length)}ms`)
  console.log(`Results count: ${results.length}`)
  
  return results
}

// Test 7: Using filters parameter with proper syntax
async function testFiltersParameter(videoIds: string[]): Promise<VideoStats[]> {
  console.log(`\n=== Test 7: Filters parameter with range syntax ===`)
  const startTime = Date.now()
  
  try {
    // Try using filters with range syntax
    const params = new URLSearchParams({
      q: '*',
      targets: 'title',
      fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,tags',
      filters: 'viewCounter:[1000 TO *]', // Example filter
      _sort: '-viewCounter',
      _limit: '10'
    })
    
    console.log('Note: This test uses a view count filter as an example since contentId filtering may not be supported')
    
    const response = await fetchWithGooglebot(`${SNAPSHOT_API_URL}?${params}`)
    
    let data: any = {}
    try {
      data = await response.json()
    } catch (e) {
      console.log('Failed to parse JSON response')
    }
    
    const elapsed = Date.now() - startTime
    console.log(`Response time: ${elapsed}ms`)
    console.log(`Status: ${response.status}`)
    console.log(`Results count: ${data.data?.length || 0}`)
    
    if (data.data && data.data.length > 0) {
      console.log(`Sample results:`)
      data.data.slice(0, 3).forEach((v: any) => {
        console.log(`- ${v.contentId}: ${v.title?.substring(0, 50)}... (${v.viewCounter} views)`)
      })
      return data.data
    }
    
    console.log('No results found')
    return []
  } catch (error) {
    console.error('Error:', error)
    return []
  }
}

// Main test runner
async function runTests() {
  console.log('Starting Nicovideo Snapshot API batch query tests...')
  console.log(`Testing with video IDs: ${TEST_VIDEO_IDS.join(', ')}`)
  
  // Test single video query first
  await testSingleVideoQuery(TEST_VIDEO_IDS[0])
  
  // Test batch approaches
  const batchResults = {
    orOperator: await testOrOperatorQuery(TEST_VIDEO_IDS),
    spaceSeparated: await testSpaceSeparatedQuery(TEST_VIDEO_IDS),
    exactMatch: await testExactMatchQuery(TEST_VIDEO_IDS),
    jsonFilter: await testJsonFilterQuery(TEST_VIDEO_IDS),
    filters: await testFiltersParameter(TEST_VIDEO_IDS),
    sequential: await testSequentialQueries(TEST_VIDEO_IDS)
  }
  
  // Summary
  console.log('\n=== SUMMARY ===')
  console.log('Results count by approach:')
  console.log(`- OR operator: ${batchResults.orOperator.length}`)
  console.log(`- Space-separated: ${batchResults.spaceSeparated.length}`)
  console.log(`- Exact match (quoted): ${batchResults.exactMatch.length}`)
  console.log(`- JsonFilter: ${batchResults.jsonFilter.length}`)
  console.log(`- Filters parameter: ${batchResults.filters.length}`)
  console.log(`- Sequential (baseline): ${batchResults.sequential.length}`)
  
  // Check which approach found all requested videos
  console.log('\nCompleteness check:')
  for (const [approach, results] of Object.entries(batchResults)) {
    if (approach === 'filters') continue // Skip filters test as it's just an example
    
    const foundIds = results.map(v => v.contentId)
    const foundCount = TEST_VIDEO_IDS.filter(id => foundIds.includes(id)).length
    console.log(`- ${approach}: ${foundCount}/${TEST_VIDEO_IDS.length} videos found`)
  }
  
  // Performance comparison
  console.log('\n=== PERFORMANCE ANALYSIS ===')
  if (batchResults.sequential.length > 0) {
    console.log(`Sequential approach: ~${50 * TEST_VIDEO_IDS.length}ms (with delays)`)
    console.log(`Best batch approach would save: ~${50 * (TEST_VIDEO_IDS.length - 1)}ms per batch`)
  }
  
  // Additional insights
  console.log('\n=== RECOMMENDATIONS ===')
  if (batchResults.orOperator.length >= TEST_VIDEO_IDS.length) {
    console.log('✅ OR operator approach works for batch queries!')
    console.log('   Use format: "sm123 OR sm456 OR sm789" with targets="title"')
  } else if (batchResults.exactMatch.length >= TEST_VIDEO_IDS.length) {
    console.log('✅ Exact match with quotes works for batch queries!')
    console.log('   Use format: "sm123" OR "sm456" OR "sm789" with targets="title,description"')
  } else {
    console.log('❌ No reliable batch approach found for fetching multiple specific videos.')
    console.log('   The API seems designed for search queries rather than bulk ID lookups.')
    console.log('   Sequential queries with caching may be the most reliable approach.')
  }
  
  console.log('\n=== API LIMITATIONS DISCOVERED ===')
  console.log('1. contentId is not a valid search target')
  console.log('2. _sort parameter is required for most queries')
  console.log('3. Filters parameter uses specific syntax (e.g., field:[min TO max])')
  console.log('4. The API is optimized for text search, not ID-based lookups')
}

// Run the tests
runTests().catch(console.error)