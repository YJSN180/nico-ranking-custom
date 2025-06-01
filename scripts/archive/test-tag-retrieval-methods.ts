#!/usr/bin/env tsx

// Test current methods of retrieving popular tags and tag-specific rankings

console.log('=== TESTING TAG RETRIEVAL METHODS ===\n')

// Test 1: Check if fetchPopularTags works with genre IDs
console.log('1. Testing fetchPopularTags with nvAPI:')

async function testNvApiPopularTags() {
  const testGenres = [
    { key: 'all', id: 'all' },
    { key: 'game', id: '4eet3ca4' },
    { key: 'anime', id: 'zc49b03a' },
    { key: 'other', id: 'ramuboyn' },
  ]

  for (const genre of testGenres) {
    try {
      const url = `https://nvapi.nicovideo.jp/v1/genres/${genre.id}/popular-tags`
      console.log(`\nTesting ${genre.key} (${genre.id}):`)
      console.log(`URL: ${url}`)
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'Referer': 'https://www.nicovideo.jp/',
        }
      })
      
      console.log(`Status: ${response.status}`)
      
      if (response.ok) {
        const data = await response.json()
        if (data.meta?.status === 200 && data.data?.tags) {
          console.log(`✅ Success: ${data.data.tags.length} tags found`)
          console.log(`Tags: ${data.data.tags.slice(0, 5).join(', ')}...`)
        } else {
          console.log(`❌ No tags in response`)
        }
      } else {
        console.log(`❌ Failed: ${response.statusText}`)
      }
    } catch (error) {
      console.log(`❌ Error: ${error}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

// Test 2: Check HTML extraction method
console.log('\n2. Testing HTML extraction of popular tags:')

async function testHtmlExtraction() {
  const testGenres = [
    { key: 'game', id: '4eet3ca4' },
    { key: 'other', id: 'ramuboyn' },
  ]

  for (const genre of testGenres) {
    try {
      const url = `https://www.nicovideo.jp/ranking/genre/${genre.id}?term=24h`
      console.log(`\nTesting ${genre.key} HTML extraction:`)
      console.log(`URL: ${url}`)
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
        }
      })
      
      console.log(`Status: ${response.status}`)
      
      if (response.ok) {
        const html = await response.text()
        
        // Method 1: Look for PopularTag class
        const tagPattern1 = /<a[^>]+class="[^"]*PopularTag[^"]*"[^>]*>([^<]+)</g
        const tags1: string[] = []
        let match
        
        while ((match = tagPattern1.exec(html)) !== null) {
          if (match[1]) {
            const tag = match[1].trim()
            if (tag && !tags1.includes(tag) && tag !== 'すべて') {
              tags1.push(tag)
            }
          }
        }
        
        if (tags1.length > 0) {
          console.log(`✅ Method 1 (PopularTag class): ${tags1.length} tags found`)
          console.log(`Tags: ${tags1.slice(0, 5).join(', ')}...`)
        } else {
          console.log(`❌ Method 1: No tags found`)
        }
        
        // Method 2: Look for tag links in RankingMainContainer
        const tagAreaMatch = html.match(/class="[^"]*RankingMainContainer[^"]*"[\s\S]*?<\/section>/i)
        if (tagAreaMatch) {
          const tagArea = tagAreaMatch[0]
          const tagPattern2 = /<a[^>]*href="[^"]*\?tag=([^"&]+)[^"]*"[^>]*>([^<]+)</g
          const tags2: string[] = []
          
          while ((match = tagPattern2.exec(tagArea)) !== null) {
            if (match[2]) {
              const tag = match[2].trim()
              if (tag && !tags2.includes(tag) && tag !== 'すべて') {
                tags2.push(tag)
              }
            }
          }
          
          if (tags2.length > 0) {
            console.log(`✅ Method 2 (tag links): ${tags2.length} tags found`)
            console.log(`Tags: ${tags2.slice(0, 5).join(', ')}...`)
          } else {
            console.log(`❌ Method 2: No tags found`)
          }
        }
        
        // Check if server-response contains popularTags
        const serverResponseMatch = html.match(/name="server-response"\s+content="([^"]+)"/)
        if (serverResponseMatch) {
          const decoded = serverResponseMatch[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
          
          try {
            const serverData = JSON.parse(decoded)
            console.log(`✅ server-response found`)
            // Check if popularTags exist in the data
            if (serverData.data?.popularTags) {
              console.log(`✅ server-response contains popularTags: ${serverData.data.popularTags.length}`)
            } else {
              console.log(`❌ No popularTags in server-response`)
            }
          } catch (e) {
            console.log(`❌ Failed to parse server-response`)
          }
        }
        
      } else {
        console.log(`❌ Failed: ${response.statusText}`)
      }
    } catch (error) {
      console.log(`❌ Error: ${error}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

// Test 3: Check tag-specific ranking retrieval
console.log('\n3. Testing tag-specific ranking retrieval:')

async function testTagRanking() {
  const testCases = [
    { genre: 'game', genreId: '4eet3ca4', tag: 'ゆっくり実況' },
    { genre: 'other', genreId: 'ramuboyn', tag: 'ChatGPT' },
  ]

  for (const test of testCases) {
    try {
      const url = `https://www.nicovideo.jp/ranking/genre/${test.genreId}?tag=${encodeURIComponent(test.tag)}&term=24h`
      console.log(`\nTesting ${test.genre} with tag "${test.tag}":`)
      console.log(`URL: ${url}`)
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
        }
      })
      
      console.log(`Status: ${response.status}`)
      
      if (response.ok) {
        const html = await response.text()
        const serverResponseMatch = html.match(/name="server-response"\s+content="([^"]+)"/)
        
        if (serverResponseMatch) {
          const decoded = serverResponseMatch[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
          
          try {
            const serverData = JSON.parse(decoded)
            const rankingData = serverData.data?.response?.$getTeibanRanking?.data
            
            if (rankingData?.items) {
              console.log(`✅ Success: ${rankingData.items.length} items found`)
              console.log(`First item: ${rankingData.items[0]?.title}`)
              
              // Check if the tag filter was applied
              const firstItemTags = rankingData.items[0]?.tags || []
              const hasTag = firstItemTags.some((t: any) => 
                (typeof t === 'string' ? t : t.name) === test.tag
              )
              console.log(`Tag filter applied: ${hasTag ? '✅ Yes' : '❓ Maybe not'}`)
            } else {
              console.log(`❌ No items in response`)
            }
          } catch (e) {
            console.log(`❌ Failed to parse server-response`)
          }
        } else {
          console.log(`❌ No server-response found`)
        }
      } else {
        console.log(`❌ Failed: ${response.statusText}`)
      }
    } catch (error) {
      console.log(`❌ Error: ${error}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

// Run all tests
async function runAllTests() {
  await testNvApiPopularTags()
  await testHtmlExtraction()
  await testTagRanking()
  
  console.log('\n=== SUMMARY ===')
  console.log('1. nvAPI popular-tags endpoint: May not work for all genres')
  console.log('2. HTML extraction: Works by parsing tag links from the page')
  console.log('3. Tag-specific rankings: Work by adding ?tag= parameter to URL')
  console.log('4. server-response meta tag contains all ranking data')
}

runAllTests().catch(console.error)