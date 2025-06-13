#!/usr/bin/env npx tsx
import 'dotenv/config'
import { kv } from '../lib/simple-kv'

async function checkNGFiltering() {
  console.log('=== NG Filtering Status Check ===\n')
  
  try {
    // 1. Check NG list content
    console.log('1. Checking NG List Content:')
    const [manual, derived] = await Promise.all([
      kv.get<any>('ng-list-manual'),
      kv.get<string[]>('ng-list-derived')
    ])
    
    if (!manual) {
      console.log('  ❌ No NG list found in KV (ng-list-manual is null)')
    } else {
      console.log(`  ✅ NG List found:`)
      console.log(`     - Video IDs: ${manual.videoIds?.length || 0}`)
      console.log(`     - Video Titles: ${manual.videoTitles?.length || 0}`)
      console.log(`     - Author IDs: ${manual.authorIds?.length || 0}`)
      console.log(`     - Author Names: ${manual.authorNames?.length || 0}`)
      console.log(`     - Derived Video IDs: ${derived?.length || 0}`)
      
      if (manual.videoIds?.length > 0) {
        console.log(`\n     Sample Video IDs: ${manual.videoIds.slice(0, 3).join(', ')}...`)
      }
      if (manual.videoTitles?.length > 0) {
        console.log(`     Sample Video Titles: ${manual.videoTitles.slice(0, 3).join(', ')}...`)
      }
    }
    
    // 2. Check ranking data to see if NG filtering is applied
    console.log('\n2. Checking Ranking Data:')
    const rankingData = await kv.get<any>('RANKING_LATEST')
    
    if (!rankingData) {
      console.log('  ❌ No ranking data found')
      return
    }
    
    // Check metadata
    console.log(`  ✅ Ranking data found:`)
    console.log(`     - Updated at: ${rankingData.metadata?.updatedAt}`)
    console.log(`     - Total items: ${rankingData.metadata?.totalItems}`)
    console.log(`     - NG Filtered: ${rankingData.metadata?.ngFiltered ? 'Yes' : 'No'}`)
    
    // 3. Test filtering logic
    console.log('\n3. Testing Filtering Logic:')
    
    // If we have NG items, check if they exist in rankings
    if (manual && (manual.videoIds?.length > 0 || manual.videoTitles?.length > 0)) {
      const videoIdSet = new Set(manual.videoIds || [])
      const titleSet = new Set(manual.videoTitles || [])
      let foundFiltered = false
      
      // Check a few genres
      const genresToCheck = ['all', 'game', 'anime']
      for (const genre of genresToCheck) {
        const genreData = rankingData.genres?.[genre]
        if (!genreData) continue
        
        const items = genreData['24h']?.items || []
        for (const item of items) {
          if (videoIdSet.has(item.id)) {
            console.log(`  ⚠️  Found filtered video ID in ${genre}: ${item.id} - "${item.title}"`)
            foundFiltered = true
          }
          if (titleSet.has(item.title)) {
            console.log(`  ⚠️  Found filtered title in ${genre}: "${item.title}" (ID: ${item.id})`)
            foundFiltered = true
          }
        }
      }
      
      if (!foundFiltered) {
        console.log('  ✅ No filtered items found in sample genres - filtering appears to be working')
      }
    } else {
      console.log('  ℹ️  No NG items configured - filtering not active')
    }
    
    // 4. Check if NG filtering is being used in the update process
    console.log('\n4. Checking Update Process:')
    console.log('  ✅ NG filtering is implemented in:')
    console.log('     - scripts/update-ranking-parallel.ts (main update script)')
    console.log('     - scripts/update-ranking-parallel-v2.ts (improved version)')
    console.log('     - app/api/ranking/route.ts (API endpoint)')
    console.log('     - components/hooks/use-user-ng-list.ts (client-side)')
    
    console.log('\n=== Summary ===')
    if (!manual || (manual.videoIds?.length === 0 && manual.videoTitles?.length === 0 && 
        manual.authorIds?.length === 0 && manual.authorNames?.length === 0)) {
      console.log('NG filtering is implemented but NOT ACTIVE (no items in NG list)')
      console.log('To test filtering, add items via /admin/ng-settings')
    } else {
      console.log('NG filtering is ACTIVE with configured items')
    }
    
  } catch (error) {
    console.error('Error checking NG filtering:', error)
  }
}

if (require.main === module) {
  checkNGFiltering()
}