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
  
  // Check metadata
  const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/RANKING_LATEST`
  
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
      console.log()
    } else {
      console.error(`Failed to fetch metadata: ${metadataResponse.status}`)
    }
    
    // Try to fetch the actual data
    const dataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`
    
    const dataResponse = await fetch(dataUrl, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })
    
    if (dataResponse.ok) {
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
          console.log(`- Genres: ${Object.keys(parsed.genres || {}).length}`)
          console.log(`- Metadata: ${JSON.stringify(parsed.metadata, null, 2)}`)
          console.log(`- Has derivativeNGData: ${!!parsed.derivativeNGData}`)
          
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
          }
        } catch (e) {
          console.error('Failed to decompress data:', e)
        }
      } else {
        console.log('Data is not gzipped')
      }
    } else {
      console.error(`Failed to fetch data: ${dataResponse.status}`)
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
}

checkKVData()