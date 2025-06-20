#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function checkKVData() {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.error('Cloudflare credentials not configured')
    process.exit(1)
  }
  
  console.log('Checking KV data...\n')
  
  // Keys to check - both old and new structure
  const keys = ['RANKING_GROUP_1', 'RANKING_GROUP_2', 'RANKING_GROUP_3', 'RANKING_LATEST']
  const foundKeys: string[] = []
  let totalGenres = 0
  let totalItems = 0
  
  for (const key of keys) {
    console.log(`\n========== Checking ${key} ==========`)
    
    // Check metadata
    const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/${key}`
    
    try {
      const metadataResponse = await fetch(metadataUrl, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
      })
      
      if (metadataResponse.ok) {
        const metadata = await metadataResponse.json()
        console.log('KV Metadata:')
        console.log(JSON.stringify(metadata.result, null, 2))
      } else if (metadataResponse.status === 404) {
        console.log(`Key not found: ${key}`)
        continue
      } else {
        console.error(`Failed to fetch metadata: ${metadataResponse.status}`)
      }
      
      // Try to fetch the actual data
      const dataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${key}`
      
      const dataResponse = await fetch(dataUrl, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
      })
      
      if (dataResponse.ok) {
        foundKeys.push(key)
        const data = await dataResponse.arrayBuffer()
        console.log(`Data size: ${data.byteLength} bytes (${(data.byteLength / 1024 / 1024).toFixed(2)} MB)`)
        
        // Check if it's gzipped
        const uint8Array = new Uint8Array(data)
        if (uint8Array[0] === 0x1f && uint8Array[1] === 0x8b) {
          console.log('Data is gzipped')
          
          // Try to decompress and check structure
          try {
            const pako = await import('pako')
            const decompressed = pako.ungzip(uint8Array, { to: 'string' })
            const parsed = JSON.parse(decompressed)
            
            console.log('\nData structure:')
            const genreCount = Object.keys(parsed.genres || {}).length
            console.log(`- Genres: ${genreCount}`)
            console.log(`- Genre names: ${Object.keys(parsed.genres || {}).join(', ')}`)
            console.log(`- Metadata: ${JSON.stringify(parsed.metadata, null, 2)}`)
            console.log(`- Has derivativeNGData: ${!!parsed.derivativeNGData}`)
            
            totalGenres += genreCount
            
            if (parsed.derivativeNGData) {
              console.log(`\nDerivative NG Data:`)
              console.log(`- Blocked video IDs: ${parsed.derivativeNGData.blockedVideoIds?.length || 0}`)
              console.log(`- Blocked author IDs: ${parsed.derivativeNGData.blockedAuthorIds?.length || 0}`)
              console.log(`- Stats: ${JSON.stringify(parsed.derivativeNGData.statsSnapshot, null, 2)}`)
            }
            
            // Check a sample genre
            const sampleGenre = Object.keys(parsed.genres || {})[0]
            if (sampleGenre && parsed.genres[sampleGenre]) {
              const genreData = parsed.genres[sampleGenre]
              console.log(`\nSample genre '${sampleGenre}':`)
              console.log(`- 24h items: ${genreData['24h']?.items?.length || 0}`)
              console.log(`- hour items: ${genreData['hour']?.items?.length || 0}`)
              console.log(`- 24h popular tags: ${genreData['24h']?.popularTags?.length || 0}`)
              console.log(`- hour popular tags: ${genreData['hour']?.popularTags?.length || 0}`)
              
              // Count total items
              if (parsed.metadata?.totalItems) {
                totalItems = parsed.metadata.totalItems
              } else {
                // Count manually if metadata doesn't have it
                for (const genre of Object.values(parsed.genres || {})) {
                  const g = genre as any
                  totalItems += (g['24h']?.items?.length || 0) + (g['hour']?.items?.length || 0)
                }
              }
            }
          } catch (e) {
            console.error('Failed to decompress data:', e)
          }
        } else {
          console.log('Data is not gzipped, trying to parse as JSON...')
          try {
            const jsonString = new TextDecoder().decode(uint8Array)
            const parsed = JSON.parse(jsonString)
            const genreCount = Object.keys(parsed.genres || {}).length
            console.log(`- Genres: ${genreCount}`)
            console.log(`- Genre names: ${Object.keys(parsed.genres || {}).join(', ')}`)
            totalGenres += genreCount
          } catch (e) {
            console.error('Failed to parse as JSON:', e)
          }
        }
      } else if (dataResponse.status !== 404) {
        console.error(`Failed to fetch data: ${dataResponse.status}`)
      }
      
    } catch (error) {
      console.error(`Error checking ${key}:`, error)
    }
  }
  
  // Summary
  console.log('\n========== Summary ==========')
  console.log(`Found keys: ${foundKeys.join(', ')}`)
  console.log(`Total genres across all keys: ${totalGenres}`)
  console.log(`Total items: ${totalItems}`)
  
  if (foundKeys.includes('RANKING_GROUP_1') && foundKeys.includes('RANKING_GROUP_2') && foundKeys.includes('RANKING_GROUP_3')) {
    console.log('\n✅ Using new 3-key structure')
    if (foundKeys.includes('RANKING_LATEST')) {
      console.log('⚠️  Old RANKING_LATEST key still exists - consider removing it')
    }
  } else if (foundKeys.includes('RANKING_LATEST')) {
    console.log('\n⚠️  Still using old single-key structure')
    console.log('Consider migrating to 3-key structure for better performance')
  } else {
    console.log('\n❌ No ranking data found in KV')
  }
}

checkKVData()