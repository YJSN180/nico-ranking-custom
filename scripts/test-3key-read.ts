#!/usr/bin/env npx tsx
import 'dotenv/config'
import { getGenreRanking, getRankingFromKV } from '../lib/cloudflare-kv'

async function test3KeyRead() {
  console.log('Testing 3-key read functionality...\n')
  
  // Test reading from specific genres in different groups
  const testCases = [
    { genre: 'all', group: 1 },
    { genre: 'game', group: 1 },
    { genre: 'dance', group: 2 },
    { genre: 'technology', group: 2 },
    { genre: 'vtuber', group: 3 },
    { genre: 'other', group: 3 }
  ]
  
  console.log('1. Testing optimized single-genre reads:')
  for (const test of testCases) {
    const startTime = Date.now()
    const data = await getGenreRanking(test.genre, '24h')
    const elapsed = Date.now() - startTime
    
    if (data) {
      console.log(`✅ ${test.genre} (Group ${test.group}): ${data.items.length} items, ${elapsed}ms`)
    } else {
      console.log(`❌ ${test.genre} (Group ${test.group}): No data found`)
    }
  }
  
  console.log('\n2. Testing full data read (all 3 groups merged):')
  const startTime = Date.now()
  const allData = await getRankingFromKV()
  const elapsed = Date.now() - startTime
  
  if (allData) {
    const genreCount = Object.keys(allData.genres).length
    let totalItems = 0
    
    for (const genre of Object.values(allData.genres)) {
      if (genre['24h']?.items) totalItems += genre['24h'].items.length
      if (genre['hour']?.items) totalItems += genre['hour'].items.length
    }
    
    console.log(`✅ Successfully merged all 3 groups:`)
    console.log(`   - ${genreCount} genres`)
    console.log(`   - ${totalItems} total items`)
    console.log(`   - ${elapsed}ms to fetch and merge`)
    console.log(`   - Metadata:`, allData.metadata)
  } else {
    console.log('❌ Failed to read merged data')
  }
  
  console.log('\n3. Verifying data integrity:')
  // Check that all 23 genres are present
  const expectedGenres = [
    'all', 'game', 'anime', 'vocaloid', 'voicesynthesis',
    'entertainment', 'music', 'sing', 'dance', 'play',
    'commentary', 'cooking', 'travel', 'nature', 'vehicle',
    'technology', 'society', 'mmd', 'vtuber', 'radio',
    'sports', 'animal', 'other'
  ]
  
  if (allData) {
    const missingGenres = expectedGenres.filter(g => !allData.genres[g])
    if (missingGenres.length === 0) {
      console.log('✅ All 23 genres present')
    } else {
      console.log(`❌ Missing genres: ${missingGenres.join(', ')}`)
    }
  }
}

test3KeyRead().catch(console.error)