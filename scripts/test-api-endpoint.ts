#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// Set up the environment variable for Cloudflare KV to be used
process.env.CLOUDFLARE_KV_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID

import { GET } from '../app/api/ranking/route'
import { NextRequest } from 'next/server'

async function main() {
  console.log('Testing /api/ranking endpoint with Cloudflare KV...\n')

  // Test cases
  const testCases = [
    { genre: 'all', period: '24h', description: 'All genre (24h)' },
    { genre: 'game', period: '24h', description: 'Game genre (24h)' },
    { genre: 'anime', period: 'hour', description: 'Anime genre (hourly)' },
    { genre: 'technology', period: '24h', tag: '作ってみた', description: 'Technology with tag' },
  ]

  for (const test of testCases) {
    console.log(`\n=== ${test.description} ===`)
    
    const url = new URL('http://localhost:3000/api/ranking')
    url.searchParams.set('genre', test.genre)
    url.searchParams.set('period', test.period)
    if (test.tag) {
      url.searchParams.set('tag', test.tag)
    }

    const request = new NextRequest(url)
    
    try {
      const response = await GET(request)
      const data = await response.json()
      
      console.log(`Status: ${response.status}`)
      console.log('Cache status:', response.headers.get('X-Cache-Status'))
      
      if (data.items) {
        console.log(`Items: ${data.items.length}`)
        if (data.items.length > 0) {
          console.log(`First item: ${data.items[0].title} (${data.items[0].id})`)
        }
      }
      
      if (data.popularTags) {
        console.log(`Popular tags: ${data.popularTags.length}`)
        if (data.popularTags.length > 0) {
          console.log(`First 5 tags: ${data.popularTags.slice(0, 5).join(', ')}`)
        }
      } else {
        console.log('Popular tags: not included')
      }
      
    } catch (error) {
      console.error('Error:', error)
    }
  }
}

if (require.main === module) {
  main()
}