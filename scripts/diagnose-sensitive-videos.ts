#!/usr/bin/env tsx

// Script to diagnose sensitive video issues
// Usage: npm run diagnose or npx tsx scripts/diagnose-sensitive-videos.ts

import { completeHybridScrapeV2 } from '../lib/complete-hybrid-scraper-v2'
import { completeHybridScrape } from '../lib/complete-hybrid-scraper'
import { scrapeRankingPage } from '../lib/scraper'
import { kv } from '@vercel/kv'

async function diagnose() {
  console.log('🔍 Diagnosing Sensitive Video Issues\n')
  
  const genre = 'all'
  
  try {
    // Test 1: Direct V2 Implementation
    console.log('1️⃣ Testing V2 Implementation Directly...')
    const v2Result = await completeHybridScrapeV2(genre, '24h')
    const v2Sensitive = v2Result.items.filter(item => item.requireSensitiveMasking === true)
    console.log(`   Total items: ${v2Result.items.length}`)
    console.log(`   Sensitive items: ${v2Sensitive.length}`)
    if (v2Sensitive.length > 0) {
      console.log(`   Sample sensitive: ${v2Sensitive[0]?.id} - ${v2Sensitive[0]?.title?.substring(0, 30)}...`)
    }
    
    // Test 2: Direct V1 Implementation  
    console.log('\n2️⃣ Testing V1 Implementation...')
    try {
      const v1Result = await completeHybridScrape(genre, '24h')
      const v1Sensitive = v1Result.items.filter(item => item.requireSensitiveMasking === true)
      console.log(`   Total items: ${v1Result.items.length}`)
      console.log(`   Sensitive items: ${v1Sensitive.length}`)
    } catch (error) {
      console.log(`   Error: ${error}`)
    }
    
    // Test 3: Check what scrapeRankingPage returns
    console.log('\n3️⃣ Testing scrapeRankingPage (used by update-ranking)...')
    const scrapeResult = await scrapeRankingPage(genre, '24h')
    const scrapeSensitive = scrapeResult.items.filter(item => item.requireSensitiveMasking === true)
    console.log(`   Total items: ${scrapeResult.items.length}`)
    console.log(`   Sensitive items: ${scrapeSensitive.length}`)
    console.log(`   Has popularTags: ${!!scrapeResult.popularTags}`)
    
    // Test 4: Check KV data
    console.log('\n4️⃣ Checking KV Cache...')
    try {
      const cacheKey = `ranking-${genre}`
      const kvData = await kv.get(cacheKey)
      if (kvData) {
        const parsed = typeof kvData === 'string' ? JSON.parse(kvData) : kvData
        const items = Array.isArray(parsed) ? parsed : parsed.items || []
        const kvSensitive = items.filter((item: any) => item.requireSensitiveMasking === true)
        console.log(`   Data type: ${typeof kvData}`)
        console.log(`   Structure: ${Array.isArray(parsed) ? 'array' : 'object'}`)
        console.log(`   Total items: ${items.length}`)
        console.log(`   Sensitive items: ${kvSensitive.length}`)
      } else {
        console.log('   No data in KV')
      }
    } catch (error) {
      console.log(`   KV Error: ${error}`)
    }
    
    // Test 5: Direct HTML fetch
    console.log('\n5️⃣ Testing Direct HTML Fetch...')
    const htmlResponse = await fetch(`https://www.nicovideo.jp/ranking/genre/${genre}?term=24h`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Cookie': 'sensitive_material_status=accept',
      }
    })
    const html = await htmlResponse.text()
    const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
    if (metaMatch) {
      const decoded = metaMatch[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      const jsonData = JSON.parse(decoded)
      const items = jsonData?.data?.response?.$getTeibanRanking?.data?.items || []
      const htmlSensitive = items.filter((item: any) => item.requireSensitiveMasking === true)
      console.log(`   Total items: ${items.length}`)
      console.log(`   Sensitive items: ${htmlSensitive.length}`)
    } else {
      console.log('   No meta tag found')
    }
    
    // Summary
    console.log('\n📊 Summary:')
    console.log('- V2 should be returning sensitive videos from HTML meta tag')
    console.log('- scrapeRankingPage uses V2 implementation')
    console.log('- update-ranking.ts saves the data from scrapeRankingPage to KV')
    console.log('- If sensitive videos are in V2 but not in KV, the issue is in the save process')
    
  } catch (error) {
    console.error('Error during diagnosis:', error)
  }
}

// Run if called directly
if (require.main === module) {
  diagnose().catch(console.error)
}

export { diagnose }