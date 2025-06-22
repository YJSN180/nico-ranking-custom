#!/usr/bin/env npx tsx
// DEPRECATED: This script is no longer needed
// Each parallel job in GitHub Actions now fetches fresh NG list directly from KV
// This ensures admin NG list updates are immediately reflected in the next run

import * as fs from 'fs/promises'

async function fetchNGListFromKV(): Promise<void> {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare KV credentials not configured")
  }

  console.log('Fetching NG list from KV...')
  
  // Fetch master NG list
  const masterUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-master`
  
  try {
    const response = await fetch(masterUrl, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('No master NG list found, creating empty list')
        await fs.writeFile('ng-list.json', JSON.stringify({ videoIds: [], authorIds: [] }))
        return
      }
      throw new Error(`Failed to fetch NG list: ${response.status} ${response.statusText}`)
    }
    
    const ngList = await response.json()
    
    // Validate structure
    if (!ngList.videoIds || !ngList.authorIds) {
      console.log('Invalid NG list structure, creating default')
      await fs.writeFile('ng-list.json', JSON.stringify({ videoIds: [], authorIds: [] }))
      return
    }
    
    console.log(`Fetched NG list: ${ngList.videoIds.length} video IDs, ${ngList.authorIds.length} author IDs`)
    
    // Save to file
    await fs.writeFile('ng-list.json', JSON.stringify(ngList))
    console.log('NG list saved to ng-list.json')
    
  } catch (error) {
    console.error('Error fetching NG list:', error)
    // Create empty list on error
    await fs.writeFile('ng-list.json', JSON.stringify({ videoIds: [], authorIds: [] }))
  }
}

// Run if called directly
fetchNGListFromKV().catch(error => {
  console.error('Failed to fetch NG list:', error)
  process.exit(1)
})