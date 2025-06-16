#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function checkTempKeys() {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.error('Cloudflare credentials not configured')
    process.exit(1)
  }
  
  console.log('Checking for temporary keys in KV...\n')
  
  const listUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/keys?prefix=RANKING_TEMP_`
  
  try {
    const response = await fetch(listUrl, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })
    
    if (!response.ok) {
      console.error(`Failed to list keys: ${response.status}`)
      return
    }
    
    const data = await response.json()
    const keys = data.result || []
    
    if (keys.length === 0) {
      console.log('No temporary keys found')
      return
    }
    
    console.log(`Found ${keys.length} temporary keys:`)
    for (const key of keys) {
      console.log(`\n- ${key.name}`)
      
      // Get metadata for this key
      const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/${key.name}`
      
      try {
        const metaResponse = await fetch(metadataUrl, {
          headers: {
            'Authorization': `Bearer ${CF_API_TOKEN}`,
          },
        })
        
        if (metaResponse.ok) {
          const metadata = await metaResponse.json()
          if (metadata.result) {
            console.log(`  Metadata: ${JSON.stringify(metadata.result)}`)
          }
        }
      } catch (e) {
        // Ignore metadata errors
      }
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
}

checkTempKeys()