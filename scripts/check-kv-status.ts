#!/usr/bin/env npx tsx
// Check the current status of Cloudflare KV data

import { getRankingFromKV } from '../lib/cloudflare-kv'

async function checkKVStatus() {
  console.log('Checking Cloudflare KV status...')
  
  try {
    const data = await getRankingFromKV()
    
    if (!data) {
      console.log('❌ No data found in KV')
      return
    }
    
    console.log('✅ Data found in KV')
    console.log('\nMetadata:')
    console.log(`  Version: ${data.metadata?.version || 'N/A'}`)
    console.log(`  Last Updated: ${data.metadata?.updatedAt || 'N/A'}`)
    console.log(`  Total Items: ${data.metadata?.totalItems || 'N/A'}`)
    
    if (data.metadata?.updatedAt) {
      const lastUpdate = new Date(data.metadata.updatedAt)
      const now = new Date()
      const diffMinutes = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60))
      console.log(`  Age: ${diffMinutes} minutes`)
    }
    
    console.log('\nGenres:')
    const genres = Object.keys(data.genres || {})
    console.log(`  Total genres: ${genres.length}`)
    
    if (genres.length > 0) {
      console.log('\n  Genre details:')
      for (const genre of genres.slice(0, 5)) {
        const genreData = data.genres[genre]
        console.log(`    ${genre}:`)
        console.log(`      24h items: ${genreData?.['24h']?.items?.length || 0}`)
        console.log(`      hour items: ${genreData?.hour?.items?.length || 0}`)
        console.log(`      24h tags: ${Object.keys(genreData?.['24h']?.tags || {}).length}`)
        console.log(`      hour tags: ${Object.keys(genreData?.hour?.tags || {}).length}`)
      }
      
      if (genres.length > 5) {
        console.log(`    ... and ${genres.length - 5} more genres`)
      }
    }
    
    // Check for specific test genre
    const testGenre = 'all'
    if (data.genres[testGenre]) {
      console.log(`\n${testGenre} genre sample:`)
      const firstItem = data.genres[testGenre]['24h']?.items?.[0]
      if (firstItem) {
        console.log(`  First item: ${firstItem.title}`)
        console.log(`  ID: ${firstItem.id}`)
        console.log(`  Views: ${firstItem.views}`)
      }
    }
    
  } catch (error) {
    console.error('❌ Error reading from KV:', error)
  }
}

checkKVStatus().catch(console.error)