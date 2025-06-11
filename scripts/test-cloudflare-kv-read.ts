#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv'
import * as path from 'path'
import { getRankingFromKV, getGenreRanking } from '../lib/cloudflare-kv'

// Load .env.local explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  console.log('Testing Cloudflare KV read...')
  console.log('Environment variables:')
  console.log('- CLOUDFLARE_ACCOUNT_ID:', process.env.CLOUDFLARE_ACCOUNT_ID ? '✓' : '✗')
  console.log('- CLOUDFLARE_KV_NAMESPACE_ID:', process.env.CLOUDFLARE_KV_NAMESPACE_ID ? '✓' : '✗')
  console.log('- CLOUDFLARE_KV_API_TOKEN:', process.env.CLOUDFLARE_KV_API_TOKEN ? '✓' : '✗')

  try {
    // 全データを取得
    console.log('\n1. Fetching all data...')
    const allData = await getRankingFromKV()
    
    if (!allData) {
      console.log('No data found in Cloudflare KV')
      return
    }

    console.log('Data retrieved successfully!')
    console.log('- Version:', allData.version || allData.metadata?.version || 'N/A')
    console.log('- Updated at:', allData.timestamp || allData.metadata?.updatedAt || 'N/A')
    console.log('- Total items:', allData.metadata?.totalItems || 'N/A')
    console.log('- Genres:', Object.keys(allData.genres).join(', '))

    // 特定のジャンルデータを取得
    console.log('\n2. Fetching game genre data...')
    const gameData = await getGenreRanking('game', '24h')
    
    if (gameData) {
      console.log('Game genre data:')
      console.log('- Items:', gameData.items.length)
      console.log('- Popular tags:', gameData.popularTags?.join(', ') || 'None')
      
      if (gameData.items.length > 0) {
        console.log('- First item:', {
          rank: gameData.items[0].rank,
          title: gameData.items[0].title,
          id: gameData.items[0].id
        })
      }
    }

    // 各ジャンルの人気タグを確認
    console.log('\n3. Popular tags by genre:')
    for (const genre of ['all', 'game', 'anime', 'technology', 'other']) {
      const genreData = await getGenreRanking(genre, '24h')
      if (genreData) {
        console.log(`- ${genre}: ${genreData.popularTags?.length || 0} tags`)
        if (genreData.popularTags && genreData.popularTags.length > 0) {
          console.log(`  First 3: ${genreData.popularTags.slice(0, 3).join(', ')}`)
        }
      }
    }

  } catch (error) {
    console.error('Error:', error)
  }
}

if (require.main === module) {
  main()
}