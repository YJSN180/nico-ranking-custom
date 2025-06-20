#!/usr/bin/env npx tsx
import 'dotenv/config'

async function testKVData() {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.error("Cloudflare KV credentials not configured")
    return
  }

  // Test all KV keys
  const keys = ['RANKING_GROUP_1', 'RANKING_GROUP_2', 'RANKING_GROUP_3', 'RANKING_LATEST']
  
  for (const key of keys) {
    console.log(`\n=== Testing ${key} ===`)
    
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${key}`
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${CF_API_TOKEN}` }
      })
      
      if (response.status === 404) {
        console.log(`❌ ${key} does not exist`)
        continue
      }
      
      if (!response.ok) {
        console.log(`❌ Error reading ${key}: ${response.status}`)
        continue
      }
      
      const data = await response.arrayBuffer()
      const jsonString = new TextDecoder().decode(new Uint8Array(data))
      const parsed = JSON.parse(jsonString)
      
      console.log(`✅ ${key} exists`)
      console.log(`   Size: ${(data.byteLength / 1024 / 1024).toFixed(2)} MB`)
      console.log(`   Metadata:`, parsed.metadata || 'None')
      
      if (parsed.genres) {
        console.log(`   Genres: ${Object.keys(parsed.genres).join(', ')}`)
        
        // Check first genre data freshness
        const firstGenre = Object.keys(parsed.genres)[0]
        const firstItem = parsed.genres[firstGenre]?.['24h']?.items?.[0]
        if (firstItem) {
          console.log(`   Sample: ${firstGenre} rank #1 = ${firstItem.title}`)
        }
      }
    } catch (error) {
      console.error(`❌ Error with ${key}:`, error)
    }
  }
}

testKVData()