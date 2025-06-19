#!/usr/bin/env npx tsx

import 'dotenv/config'

interface DerivedEntry {
  videoId: string
  reason: string
  derivedFrom: string
  addedAt: string
}

async function checkNgListDerived() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const apiToken = process.env.CLOUDFLARE_KV_API_TOKEN

  if (!accountId || !namespaceId || !apiToken) {
    console.error('Missing required environment variables')
    console.error('Required: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_KV_NAMESPACE_ID, CLOUDFLARE_KV_API_TOKEN')
    process.exit(1)
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/ng-list-derived`

  try {
    console.log('Fetching ng-list-derived from Cloudflare KV...')
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        console.log('Key not found: ng-list-derived')
        return
      }
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    // Handle as array of strings (video IDs)
    if (Array.isArray(data) && typeof data[0] === 'string') {
      console.log('\n=== NG List Derived Summary ===')
      console.log(`Total video IDs: ${data.length}`)
      console.log('\nFirst 10 video IDs:')
      data.slice(0, 10).forEach((videoId, index) => {
        console.log(`${index + 1}. ${videoId}`)
      })
      console.log(`\nUnique video IDs: ${new Set(data).size}`)
      
      if (new Set(data).size < data.length) {
        console.log(`Note: Found ${data.length - new Set(data).size} duplicate entries`)
      }
      return
    }
    
    // Original logic for DerivedEntry format
    const derivedEntries = data as DerivedEntry[]
    
    console.log('\n=== NG List Derived Summary ===')
    console.log(`Total entries: ${derivedEntries.length}`)
    
    // Count by reason
    const reasonCounts: Record<string, number> = {}
    derivedEntries.forEach(entry => {
      reasonCounts[entry.reason] = (reasonCounts[entry.reason] || 0) + 1
    })
    
    console.log('\nBreakdown by reason:')
    Object.entries(reasonCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([reason, count]) => {
        console.log(`  ${reason}: ${count}`)
      })
    
    // Show first 10 entries
    console.log('\nFirst 10 entries:')
    derivedEntries.slice(0, 10).forEach((entry, index) => {
      console.log(`${index + 1}. Video ID: ${entry.videoId}`)
      console.log(`   Reason: ${entry.reason}`)
      console.log(`   Derived from: ${entry.derivedFrom}`)
      console.log(`   Added at: ${new Date(entry.addedAt).toLocaleString()}`)
      console.log()
    })
    
    // Show unique video IDs
    const uniqueVideoIds = new Set(derivedEntries.map(entry => entry.videoId))
    console.log(`\nUnique video IDs: ${uniqueVideoIds.size}`)
    
    // Check for duplicates
    if (uniqueVideoIds.size < derivedEntries.length) {
      console.log(`\nNote: Found ${derivedEntries.length - uniqueVideoIds.size} duplicate entries`)
    }
    
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

// Run the check
checkNgListDerived().catch(console.error)