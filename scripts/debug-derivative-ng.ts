#!/usr/bin/env npx tsx

import 'dotenv/config'

async function debugDerivativeNG() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const apiToken = process.env.CLOUDFLARE_KV_API_TOKEN

  if (!accountId || !namespaceId || !apiToken) {
    console.error('Missing required environment variables')
    process.exit(1)
  }

  console.log('=== Debugging Derivative NG List ===\n')

  // 1. Check ng-list-derived key
  console.log('1. Checking ng-list-derived key:')
  const derivedUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/ng-list-derived`
  
  try {
    const response = await fetch(derivedUrl, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
      },
    })

    if (response.ok) {
      const data = await response.json()
      console.log(`   ✓ Found ${Array.isArray(data) ? data.length : 0} entries in ng-list-derived`)
      if (data.length > 0) {
        console.log(`   First 5 entries: ${data.slice(0, 5).join(', ')}`)
      }
    } else if (response.status === 404) {
      console.log('   ✗ ng-list-derived key not found')
    } else {
      console.log(`   ✗ Error: ${response.status} ${response.statusText}`)
    }
  } catch (error) {
    console.log(`   ✗ Failed to fetch: ${error}`)
  }

  // 2. Check RANKING_LATEST for derivativeNGData
  console.log('\n2. Checking RANKING_LATEST for derivativeNGData:')
  const rankingUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/RANKING_LATEST`
  
  try {
    const response = await fetch(rankingUrl, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
      },
    })

    if (response.ok) {
      const pako = await import('pako')
      const compressed = await response.arrayBuffer()
      const decompressed = pako.ungzip(new Uint8Array(compressed))
      const jsonString = new TextDecoder().decode(decompressed)
      const data = JSON.parse(jsonString)
      
      if (data.derivativeNGData) {
        console.log('   ✓ Found derivativeNGData in ranking data:')
        console.log(`     - blockedVideoIds: ${data.derivativeNGData.blockedVideoIds?.length || 0} entries`)
        console.log(`     - blockedAuthorIds: ${data.derivativeNGData.blockedAuthorIds?.length || 0} entries`)
        console.log(`     - Stats:`)
        console.log(`       - totalVideosProcessed: ${data.derivativeNGData.statsSnapshot?.totalVideosProcessed || 0}`)
        console.log(`       - totalBlocked: ${data.derivativeNGData.statsSnapshot?.totalBlocked || 0}`)
        console.log(`       - lastUpdated: ${data.derivativeNGData.statsSnapshot?.lastUpdated || 'N/A'}`)
      } else {
        console.log('   ✗ No derivativeNGData field in ranking data')
      }
      
      console.log(`\n   Ranking metadata:`)
      console.log(`   - version: ${data.metadata?.version}`)
      console.log(`   - updatedAt: ${data.metadata?.updatedAt}`)
      console.log(`   - totalItems: ${data.metadata?.totalItems}`)
      console.log(`   - ngFiltered: ${data.metadata?.ngFiltered}`)
    } else {
      console.log(`   ✗ Error fetching ranking data: ${response.status}`)
    }
  } catch (error) {
    console.log(`   ✗ Failed to process ranking data: ${error}`)
  }

  // 3. Check if the workflow is configured correctly
  console.log('\n3. Workflow analysis:')
  console.log('   - The parallel workflow saves derived NG entries to separate files')
  console.log('   - The aggregation script saves them to ng-list-derived key')
  console.log('   - But it does NOT add derivativeNGData to the ranking data')
  console.log('   - The admin API looks for data in ng-list-derived key (correct)')
  console.log('   - The ng-list-derivative.ts helper looks in ranking data (incorrect for current workflow)')
  
  console.log('\n=== Recommendation ===')
  console.log('The aggregation script needs to be fixed to add derivativeNGData to the ranking data')
  console.log('OR the admin interface should use the ng-list-derived key directly')
}

debugDerivativeNG().catch(console.error)