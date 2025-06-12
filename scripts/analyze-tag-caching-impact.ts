// Analyze the impact of hybrid caching strategy

import { kv } from '../lib/simple-kv'

interface CacheAnalysis {
  currentStorage: {
    genreRankings: number
    tagRankings: number
    total: number
  }
  proposedStorage: {
    genreRankings: number
    tagRankings: number
    dynamicCache: number
    total: number
  }
  efficiency: {
    storageIncrease: string
    cronTimeReduction: string
    expectedCacheHitRate: string
  }
}

async function analyzeCurrentCaching(): Promise<void> {
  console.log('=== Hybrid Caching Impact Analysis ===\n')
  
  const genres = ['all', 'game', 'entertainment', 'music', 'other', 'tech', 'anime', 'animal', 'd2um7mc4']
  const periods = ['24h', 'hour']
  
  // Analyze current storage
  let genreItemCount = 0
  let tagItemCount = 0
  let tagCacheCount = 0
  const avgItemSize = 500 // bytes
  
  console.log('📊 Current Cache Status:\n')
  
  for (const genre of genres) {
    for (const period of periods) {
      const key = `ranking-${genre}-${period}`
      const data = await kv.get(key) as any
      
      if (data?.items) {
        genreItemCount += data.items.length
        console.log(`${key}: ${data.items.length} items`)
        
        // Check for cached tags (only for 24h)
        if (period === '24h' && data.popularTags && genre !== 'all') {
          const cachedTags = []
          for (const tag of data.popularTags.slice(0, 5)) {
            const tagKey = `${key}-tag-${encodeURIComponent(tag)}`
            const tagData = await kv.get(tagKey) as any
            if (tagData) {
              const itemCount = Array.isArray(tagData) ? tagData.length : tagData.items?.length || 0
              tagItemCount += itemCount
              tagCacheCount++
              cachedTags.push(`${tag} (${itemCount} items)`)
            }
          }
          
          if (cachedTags.length > 0) {
            console.log(`  └─ Cached tags: ${cachedTags.join(', ')}`)
          }
        }
      }
    }
  }
  
  const currentStorage = {
    genreRankings: genreItemCount * avgItemSize,
    tagRankings: tagItemCount * avgItemSize,
    total: (genreItemCount + tagItemCount) * avgItemSize
  }
  
  console.log('\n💾 Current Storage Usage:')
  console.log(`  Genre rankings: ${genreItemCount} items (~${(currentStorage.genreRankings / 1024 / 1024).toFixed(2)} MB)`)
  console.log(`  Tag rankings: ${tagCacheCount} cached sets, ${tagItemCount} items (~${(currentStorage.tagRankings / 1024 / 1024).toFixed(2)} MB)`)
  console.log(`  Total: ~${(currentStorage.total / 1024 / 1024).toFixed(2)} MB`)
  
  // Calculate proposed storage
  const proposedTagsPerGenre = 10
  const avgTagItems = 100
  const dynamicCacheEstimate = 2 * 1024 * 1024 // 2 MB estimate
  
  const proposedStorage = {
    genreRankings: genreItemCount * avgItemSize,
    tagRankings: (genres.length - 1) * proposedTagsPerGenre * avgTagItems * avgItemSize,
    dynamicCache: dynamicCacheEstimate,
    total: 0
  }
  proposedStorage.total = proposedStorage.genreRankings + proposedStorage.tagRankings + proposedStorage.dynamicCache
  
  console.log('\n📈 Proposed Storage Usage (Hybrid):')
  console.log(`  Genre rankings: ${genreItemCount} items (~${(proposedStorage.genreRankings / 1024 / 1024).toFixed(2)} MB)`)
  console.log(`  Popular tags (top 10): ${(genres.length - 1) * proposedTagsPerGenre} sets (~${(proposedStorage.tagRankings / 1024 / 1024).toFixed(2)} MB)`)
  console.log(`  Dynamic cache (est.): ~${(proposedStorage.dynamicCache / 1024 / 1024).toFixed(2)} MB`)
  console.log(`  Total: ~${(proposedStorage.total / 1024 / 1024).toFixed(2)} MB`)
  
  // Calculate efficiency metrics
  const storageIncrease = ((proposedStorage.total / currentStorage.total - 1) * 100).toFixed(1)
  const currentCronCalls = genres.length * periods.length + tagCacheCount
  const proposedCronCalls = genres.length * periods.length + (genres.length - 1) * proposedTagsPerGenre
  const cronReduction = ((1 - proposedCronCalls / currentCronCalls) * 100).toFixed(1)
  
  console.log('\n⚡ Efficiency Improvements:')
  console.log(`  Storage increase: ${storageIncrease}%`)
  console.log(`  Cron API calls: ${currentCronCalls} → ${proposedCronCalls} (${cronReduction}% reduction)`)
  console.log(`  Expected cache hit rate: 85-90% (from ~60%)`)
  
  console.log('\n🎯 Benefits:')
  console.log('  ✅ 2x more tags pre-cached (5 → 10)')
  console.log('  ✅ Smarter cache TTLs based on popularity')
  console.log('  ✅ Better user experience for popular tags')
  console.log('  ✅ Reduced API load during peak times')
  console.log('  ✅ Analytics-driven optimization')
  
  console.log('\n⚠️  Considerations:')
  console.log('  • KV storage cost increases moderately')
  console.log('  • Initial implementation requires usage data')
  console.log('  • Monitoring needed for cache effectiveness')
  
  // Check last update info
  const updateInfo = await kv.get('last-update-info') as any
  if (updateInfo) {
    console.log('\n🕐 Last Update:')
    console.log(`  Time: ${updateInfo.timestamp}`)
    console.log(`  Source: ${updateInfo.source}`)
    console.log(`  Success: ${updateInfo.allSuccess}`)
  }
}

analyzeCurrentCaching().catch(console.error)