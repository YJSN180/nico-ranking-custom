#!/usr/bin/env npx tsx
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN

async function testKVAccess() {
  console.log('Testing Cloudflare KV access for NG list...')
  console.log('Account ID:', CF_ACCOUNT_ID)
  console.log('Namespace ID:', CF_NAMESPACE_ID)
  console.log('API Token:', CF_API_TOKEN ? `${CF_API_TOKEN.substring(0, 10)}...` : 'NOT SET')
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.error('Missing required environment variables')
    return
  }

  // Test ng-list-manual
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-manual`
    console.log('\nFetching ng-list-manual...')
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })
    
    console.log('Response status:', response.status)
    console.log('Response headers:', Object.fromEntries(response.headers.entries()))
    
    if (response.ok) {
      const data = await response.text()
      try {
        const parsed = JSON.parse(data)
        console.log('ng-list-manual data:', JSON.stringify(parsed, null, 2))
      } catch {
        console.log('ng-list-manual raw data:', data)
      }
    } else {
      const errorText = await response.text()
      console.log('Error response:', errorText)
    }
  } catch (error) {
    console.error('Error fetching ng-list-manual:', error)
  }

  // Test ng-list-derived
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-derived`
    console.log('\nFetching ng-list-derived...')
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })
    
    console.log('Response status:', response.status)
    
    if (response.ok) {
      const data = await response.text()
      try {
        const parsed = JSON.parse(data)
        console.log('ng-list-derived data:', JSON.stringify(parsed, null, 2))
      } catch {
        console.log('ng-list-derived raw data:', data)
      }
    } else {
      const errorText = await response.text()
      console.log('Error response:', errorText)
    }
  } catch (error) {
    console.error('Error fetching ng-list-derived:', error)
  }

  // List all keys to see what's actually stored
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/keys`
    console.log('\nListing all keys in KV namespace...')
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })
    
    if (response.ok) {
      const data = await response.json()
      console.log('Total keys found:', data.result?.length || 0)
      if (data.result && data.result.length > 0) {
        console.log('Keys containing "ng":', data.result.filter((key: any) => key.name.includes('ng')))
      }
    } else {
      const errorText = await response.text()
      console.log('Error listing keys:', errorText)
    }
  } catch (error) {
    console.error('Error listing keys:', error)
  }
}

testKVAccess()