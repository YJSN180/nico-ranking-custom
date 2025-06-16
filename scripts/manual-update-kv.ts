#!/usr/bin/env npx tsx
// Manual script to update KV with ranking data

import 'dotenv/config'
import { updateRankingData } from '../lib/update-ranking'

async function main() {
  console.log('Starting manual ranking update...')
  console.log('Environment check:')
  console.log(`  CLOUDFLARE_ACCOUNT_ID: ${process.env.CLOUDFLARE_ACCOUNT_ID ? '✓' : '✗'}`)
  console.log(`  CLOUDFLARE_KV_NAMESPACE_ID: ${process.env.CLOUDFLARE_KV_NAMESPACE_ID ? '✓' : '✗'}`)
  console.log(`  CLOUDFLARE_KV_API_TOKEN: ${process.env.CLOUDFLARE_KV_API_TOKEN ? '✓' : '✗'}`)
  
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_KV_NAMESPACE_ID || !process.env.CLOUDFLARE_KV_API_TOKEN) {
    console.error('Missing required environment variables!')
    process.exit(1)
  }
  
  try {
    const result = await updateRankingData()
    
    if (result.success) {
      console.log('✅ Update completed successfully!')
      console.log(`Updated genres: ${result.updatedGenres.length}`)
      console.log(`Failed genres: ${result.failedGenres?.length || 0}`)
    } else {
      console.error('❌ Update failed:', result.error)
      if (result.failedGenres) {
        console.error('Failed genres:', result.failedGenres)
      }
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  }
}

main()