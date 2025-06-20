#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs/promises'
import { GENRE_GROUPS } from '../types/ranking-config'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function forceKVUpdate() {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.error('Cloudflare credentials not configured')
    process.exit(1)
  }
  
  console.log('Force KV Update - Writing to 3-key structure')
  console.log('===========================================\n')
  
  // Check if we have recent aggregated data locally
  const dataPath = path.join(process.cwd(), 'tmp', 'latest-aggregated-data.json')
  
  try {
    // First, try to read existing aggregated data
    let fullData
    try {
      const content = await fs.readFile(dataPath, 'utf-8')
      fullData = JSON.parse(content)
      console.log('Found existing aggregated data')
      console.log(`- Genres: ${Object.keys(fullData.genres).length}`)
      console.log(`- Total items: ${fullData.metadata.totalItems}`)
      console.log(`- Updated at: ${fullData.metadata.updatedAt}`)
    } catch (e) {
      console.log('No existing aggregated data found. Please run the workflow first.')
      return
    }
    
    // Wait for rate limits to clear
    console.log('\nWaiting 2 minutes for rate limits to clear...')
    await new Promise(resolve => setTimeout(resolve, 120000)) // 2 minutes
    
    console.log('\nSplitting data into 3 groups...')
    
    // Write data split into 3 groups
    for (const [groupId, genreList] of Object.entries(GENRE_GROUPS)) {
      const groupData = {
        genres: {} as any,
        metadata: {
          ...fullData.metadata,
          groupId: parseInt(groupId),
          genresInGroup: genreList
        }
      }
      
      // Extract only genres in this group
      for (const genre of genreList) {
        if (fullData.genres[genre]) {
          groupData.genres[genre] = fullData.genres[genre]
        }
      }
      
      // Calculate size
      const jsonString = JSON.stringify(groupData)
      const groupSize = jsonString.length / 1024 / 1024
      console.log(`\nGroup ${groupId}: ${groupSize.toFixed(2)} MB (${genreList.length} genres)`)
      console.log(`Genres: ${genreList.join(', ')}`)
      
      // No compression for now (to match aggregate-ranking-results-direct.ts)
      const keyName = `RANKING_GROUP_${groupId}`
      const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${keyName}`
      
      console.log(`Attempting to write to ${keyName}...`)
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: jsonString,
      })
      
      if (response.ok) {
        console.log(`✅ Successfully wrote to ${keyName}!`)
        
        // Update metadata
        const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/${keyName}`
        
        await fetch(metadataUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${CF_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            compressed: false,
            version: 1,
            updatedAt: fullData.metadata.updatedAt,
            totalItems: fullData.metadata.totalItems,
            ngFiltered: true,
            forcedUpdate: true,
            groupId: parseInt(groupId),
            genresInGroup: genreList
          }),
        })
        
        console.log(`✅ Metadata updated for ${keyName}!`)
      } else {
        console.error(`❌ Failed to write ${keyName}: ${response.status}`)
        const error = await response.text()
        console.error(error)
        // Continue with other groups even if one fails
      }
      
      // Small delay between writes
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    
    // Verify all groups
    console.log('\n\nVerifying all groups...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    for (const groupId of [1, 2, 3]) {
      const keyName = `RANKING_GROUP_${groupId}`
      const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/${keyName}`
      
      const verifyResponse = await fetch(metadataUrl, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
      })
      
      if (verifyResponse.ok) {
        const metadata = await verifyResponse.json()
        console.log(`\n${keyName} metadata:`, JSON.stringify(metadata.result, null, 2))
      } else {
        console.error(`Failed to verify ${keyName}`)
      }
    }
    
    console.log('\n✅ Force update completed!')
    console.log('The system is now using the 3-key structure.')
    
  } catch (error) {
    console.error('Error:', error)
  }
}

forceKVUpdate()