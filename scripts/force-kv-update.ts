#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs/promises'

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
  
  console.log('Force KV Update - Waiting for Rate Limits to Clear')
  console.log('===================================================\n')
  
  // Check if we have recent aggregated data locally
  const dataPath = path.join(process.cwd(), 'tmp', 'latest-aggregated-data.json')
  
  try {
    // First, try to read existing aggregated data
    let data
    try {
      const content = await fs.readFile(dataPath, 'utf-8')
      data = JSON.parse(content)
      console.log('Found existing aggregated data')
      console.log(`- Genres: ${Object.keys(data.genres).length}`)
      console.log(`- Total items: ${data.metadata.totalItems}`)
      console.log(`- Updated at: ${data.metadata.updatedAt}`)
    } catch (e) {
      console.log('No existing aggregated data found. Please run the workflow first.')
      return
    }
    
    // Wait for rate limits to clear
    console.log('\nWaiting 2 minutes for rate limits to clear...')
    await new Promise(resolve => setTimeout(resolve, 120000)) // 2 minutes
    
    // Compress data
    const pako = await import('pako')
    const jsonString = JSON.stringify(data)
    const compressed = pako.gzip(jsonString)
    
    console.log(`\nCompressed size: ${Math.round(compressed.length / 1024)}KB`)
    
    // Try to write directly to RANKING_LATEST
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`
    
    console.log('Attempting to write to KV...')
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/octet-stream',
      },
      body: compressed,
    })
    
    if (response.ok) {
      console.log('✅ Successfully wrote to RANKING_LATEST!')
      
      // Update metadata
      const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/RANKING_LATEST`
      
      await fetch(metadataUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          compressed: true,
          version: 1,
          updatedAt: data.metadata.updatedAt,
          totalItems: data.metadata.totalItems,
          ngFiltered: true,
          forcedUpdate: true,
        }),
      })
      
      console.log('✅ Metadata updated!')
      
      // Verify
      console.log('\nVerifying update...')
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const verifyResponse = await fetch(metadataUrl, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
      })
      
      if (verifyResponse.ok) {
        const metadata = await verifyResponse.json()
        console.log('Current metadata:', JSON.stringify(metadata.result, null, 2))
      }
      
    } else {
      console.error(`❌ Failed to write: ${response.status}`)
      const error = await response.text()
      console.error(error)
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
}

forceKVUpdate()