#!/usr/bin/env npx tsx
import * as fs from 'fs/promises'
import * as path from 'path'

async function testAggregate() {
  console.log('Creating test aggregated data...')
  
  // Create minimal test data
  const testData = {
    genres: {
      all: {
        '24h': {
          items: Array(100).fill(null).map((_, i) => ({
            rank: i + 1,
            id: `sm${1000000 + i}`,
            title: `Test Video ${i + 1}`,
            thumbURL: 'https://example.com/thumb.jpg',
            views: 1000 - i * 10,
            comments: 50,
            mylists: 20,
            likes: 100
          })),
          popularTags: ['test', 'video', 'tag']
        },
        hour: {
          items: Array(100).fill(null).map((_, i) => ({
            rank: i + 1,
            id: `sm${2000000 + i}`,
            title: `Test Video Hour ${i + 1}`,
            thumbURL: 'https://example.com/thumb.jpg',
            views: 500 - i * 5,
            comments: 25,
            mylists: 10,
            likes: 50
          })),
          popularTags: ['hour', 'test', 'tag']
        }
      }
    },
    metadata: {
      version: 1,
      updatedAt: new Date().toISOString(),
      totalItems: 200,
      ngFiltered: true
    }
  }
  
  // Save to tmp directory
  const tmpDir = path.join(process.cwd(), 'tmp')
  await fs.mkdir(tmpDir, { recursive: true })
  
  const outputPath = path.join(tmpDir, 'latest-aggregated-data.json')
  await fs.writeFile(outputPath, JSON.stringify(testData, null, 2))
  
  console.log(`Test data saved to: ${outputPath}`)
  console.log(`- Genres: ${Object.keys(testData.genres).length}`)
  console.log(`- Total items: ${testData.metadata.totalItems}`)
}

testAggregate()