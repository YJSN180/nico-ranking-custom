#!/usr/bin/env npx tsx
import 'dotenv/config'

async function check3KeyStatus() {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.error('Cloudflare KV credentials not configured')
    return
  }
  
  console.log('Checking 3-key split status...\n')
  
  const keys = ['RANKING_LATEST', 'RANKING_GROUP_1', 'RANKING_GROUP_2', 'RANKING_GROUP_3']
  
  for (const key of keys) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${key}`
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Range': 'bytes=0-100' // Only fetch first 100 bytes to check existence
        },
      })
      
      if (response.ok) {
        const sizeHeader = response.headers.get('content-length')
        const size = sizeHeader ? parseInt(sizeHeader) / 1024 / 1024 : 0
        console.log(`✅ ${key}: exists (${size.toFixed(2)} MB)`)
      } else if (response.status === 404) {
        console.log(`❌ ${key}: not found`)
      } else {
        console.log(`⚠️  ${key}: error ${response.status}`)
      }
    } catch (error) {
      console.log(`❌ ${key}: fetch error`, error)
    }
  }
  
  // Check metadata for the new keys
  console.log('\nChecking metadata for 3-key groups:')
  for (let i = 1; i <= 3; i++) {
    const key = `RANKING_GROUP_${i}`
    const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/${key}`
    
    try {
      const response = await fetch(metadataUrl, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
      })
      
      if (response.ok) {
        const metadata = await response.json()
        console.log(`${key} metadata:`, JSON.stringify(metadata.result, null, 2))
      }
    } catch (error) {
      // Ignore metadata errors
    }
  }
}

check3KeyStatus().catch(console.error)