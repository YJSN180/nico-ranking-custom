#!/usr/bin/env npx tsx
import 'dotenv/config'
import { decompressData } from '../lib/cloudflare-kv'
import { fetchVideoStats } from '../lib/snapshot-api'

async function analyzeMissingStats() {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  
  console.log('Analyzing missing video stats...\n')
  
  try {
    // 1. Fetch ranking data
    console.log('1. Fetching ranking data from KV...')
    const rankingResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`,
      {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`
        }
      }
    )
    
    if (!rankingResponse.ok) {
      console.error('Failed to fetch ranking data')
      return
    }
    
    const compressedData = new Uint8Array(await rankingResponse.arrayBuffer())
    const rankingData = await decompressData(compressedData)
    
    // 2. Fetch video stats
    console.log('2. Fetching video stats from KV...')
    const statsResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/VIDEO_STATS_LATEST`,
      {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`
        }
      }
    )
    
    if (!statsResponse.ok) {
      console.error('Failed to fetch video stats')
      return
    }
    
    const compressedStats = new Uint8Array(await statsResponse.arrayBuffer())
    const statsData = await decompressData(compressedStats)
    
    // 3. Extract all video IDs from ranking
    const allVideoIds = new Set<string>()
    for (const genre of Object.keys(rankingData.genres)) {
      for (const period of ['24h', 'hour'] as const) {
        const items = rankingData.genres[genre]?.[period]?.items || []
        items.forEach((item: any) => allVideoIds.add(item.id))
      }
    }
    
    // 4. Find missing videos
    const missingIds: string[] = []
    allVideoIds.forEach(id => {
      if (!statsData.stats[id]) {
        missingIds.push(id)
      }
    })
    
    console.log(`\n3. Analysis Results:`)
    console.log(`- Total videos in ranking: ${allVideoIds.size}`)
    console.log(`- Videos with stats: ${Object.keys(statsData.stats).length}`)
    console.log(`- Missing videos: ${missingIds.length}`)
    console.log(`- Success rate: ${((Object.keys(statsData.stats).length / allVideoIds.size) * 100).toFixed(2)}%`)
    
    // 5. Analyze patterns in missing videos
    console.log(`\n4. Sample missing video IDs:`)
    const sampleMissing = missingIds.slice(0, 20)
    sampleMissing.forEach(id => console.log(`  - ${id}`))
    
    // 6. Test fetching these missing videos directly
    console.log(`\n5. Testing direct fetch of first 10 missing videos...`)
    const testIds = missingIds.slice(0, 10)
    const testStats = await fetchVideoStats(testIds)
    
    console.log(`Retrieved ${Object.keys(testStats).length} out of ${testIds.length} videos`)
    
    // Check which ones still failed
    const stillMissing = testIds.filter(id => !testStats[id])
    if (stillMissing.length > 0) {
      console.log(`\n6. Videos that still failed to fetch:`)
      stillMissing.forEach(id => console.log(`  - ${id}`))
      
      // Test individual fetch to see error
      console.log(`\n7. Testing individual fetch for ${stillMissing[0]}...`)
      const params = new URLSearchParams({
        q: stillMissing[0],
        targets: 'contentId',
        fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter',
        _limit: '10'
      })
      
      const response = await fetch(
        `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?${params}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'application/json',
            'Accept-Language': 'ja'
          }
        }
      )
      
      const data = await response.json()
      console.log('Response:', JSON.stringify(data, null, 2))
    }
    
  } catch (error) {
    console.error('Analysis failed:', error)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeMissingStats()
}