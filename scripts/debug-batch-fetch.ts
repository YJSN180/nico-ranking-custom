#!/usr/bin/env tsx
import { fetchVideoStats } from '../lib/snapshot-api.js'

async function debugBatchFetch() {
  // Create a test set of video IDs
  const testIds = []
  for (let i = 1; i <= 200; i++) {
    testIds.push(`sm${i}`)
  }

  console.log(`Testing with ${testIds.length} video IDs`)
  console.log('First 10 IDs:', testIds.slice(0, 10).join(', '))
  console.log('Last 10 IDs:', testIds.slice(-10).join(', '))

  const startTime = Date.now()
  const stats = await fetchVideoStats(testIds)
  const elapsed = Date.now() - startTime

  console.log(`\nResults: Got stats for ${Object.keys(stats).length} videos in ${elapsed}ms`)

  // Show some sample results
  const foundIds = Object.keys(stats).slice(0, 5)
  console.log('\nSample results:')
  foundIds.forEach(id => {
    console.log(`- ${id}: views=${stats[id].viewCounter}, comments=${stats[id].commentCounter}`)
  })

  // Check which batches returned results
  console.log('\nBatch analysis:')
  const batchSize = 50
  for (let i = 0; i < testIds.length; i += batchSize) {
    const batch = testIds.slice(i, i + batchSize)
    const batchResults = batch.filter(id => stats[id])
    console.log(`Batch ${Math.floor(i / batchSize) + 1}: ${batchResults.length}/${batch.length} found`)
  }
}

debugBatchFetch().catch(console.error)