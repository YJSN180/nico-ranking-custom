#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv'
import * as path from 'path'
import { getPopularTags } from '../lib/popular-tags'
import type { RankingGenre } from '../types/ranking-config'

// Load .env.local explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  console.log('Testing popular tags retrieval after fix...\n')

  const genres: RankingGenre[] = ['all', 'game', 'anime', 'entertainment', 'technology']
  const periods: ('24h' | 'hour')[] = ['24h', 'hour']

  for (const genre of genres) {
    for (const period of periods) {
      console.log(`\n=== ${genre} (${period}) ===`)
      try {
        const tags = await getPopularTags(genre, period)
        console.log(`Tags found: ${tags.length}`)
        if (tags.length > 0) {
          console.log(`First 5 tags: ${tags.slice(0, 5).join(', ')}`)
        } else {
          console.log('No tags found')
        }
      } catch (error) {
        console.error(`Error: ${error}`)
      }
    }
  }
}

if (require.main === module) {
  main()
}