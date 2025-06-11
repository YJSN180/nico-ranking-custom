#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.error('Missing Cloudflare credentials')
    return
  }

  console.log('Testing direct Cloudflare KV API...')

  // List keys in namespace
  const listUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/keys`
  
  try {
    const listResponse = await fetch(listUrl, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })

    if (!listResponse.ok) {
      console.error('Failed to list keys:', listResponse.status, await listResponse.text())
      return
    }

    const listData = await listResponse.json()
    console.log('Keys in namespace:', listData)

    // Try to read the main key
    const key = 'ranking-data-bundle'
    const readUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${key}`
    
    console.log(`\nReading key: ${key}`)
    const readResponse = await fetch(readUrl, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })

    console.log('Response status:', readResponse.status)
    
    if (readResponse.ok) {
      const contentLength = readResponse.headers.get('content-length')
      console.log('Content length:', contentLength)
      
      // Check if data is compressed
      const data = await readResponse.arrayBuffer()
      const uint8Array = new Uint8Array(data)
      
      console.log('First 10 bytes:', Array.from(uint8Array.slice(0, 10)))
      
      // Check for gzip magic number
      if (uint8Array[0] === 0x1f && uint8Array[1] === 0x8b) {
        console.log('Data is gzip compressed')
        
        // Dynamic import for pako
        const pako = await import('pako')
        const decompressed = pako.ungzip(uint8Array, { to: 'string' })
        const jsonData = JSON.parse(decompressed)
        
        console.log('\nDecompressed data structure:')
        console.log('- Genres:', Object.keys(jsonData.genres || {}).length)
        console.log('- Metadata:', jsonData.metadata)
        
        // Check popular tags for each genre
        if (jsonData.genres) {
          console.log('\nPopular tags by genre:')
          for (const [genre, data] of Object.entries(jsonData.genres)) {
            const genreData = data as any
            const tags24h = genreData['24h']?.popularTags || []
            const tagsHour = genreData['hour']?.popularTags || []
            console.log(`- ${genre}:`)
            console.log(`  24h: ${tags24h.length} tags`)
            console.log(`  hour: ${tagsHour.length} tags`)
            if (tags24h.length > 0) {
              console.log(`  Sample (24h): ${tags24h.slice(0, 3).join(', ')}`)
            }
          }
        }
      } else {
        console.log('Data is not compressed')
        const text = new TextDecoder().decode(uint8Array)
        console.log('First 200 chars:', text.substring(0, 200))
      }
    } else {
      console.error('Failed to read key:', readResponse.status)
      const errorText = await readResponse.text()
      console.error('Error:', errorText)
    }

  } catch (error) {
    console.error('Error:', error)
  }
}

if (require.main === module) {
  main()
}