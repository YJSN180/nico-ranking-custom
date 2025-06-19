#!/usr/bin/env npx tsx

import 'dotenv/config'

async function debugDerivedNGAPI() {
  console.log('=== Debug Derived NG List API ===\n')
  
  // Check environment variables
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  
  console.log('Environment Variables:')
  console.log(`- CLOUDFLARE_ACCOUNT_ID: ${CF_ACCOUNT_ID ? '✓ SET' : '✗ NOT SET'}`)
  console.log(`- CLOUDFLARE_KV_NAMESPACE_ID: ${CF_NAMESPACE_ID ? '✓ SET' : '✗ NOT SET'}`)
  console.log(`- CLOUDFLARE_KV_API_TOKEN: ${CF_API_TOKEN ? '✓ SET' : '✗ NOT SET'}`)
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.error('\n❌ Missing required environment variables')
    console.log('\nPlease ensure all environment variables are set in:')
    console.log('- Local: .env.local file')
    console.log('- Production: Vercel dashboard → Settings → Environment Variables')
    return
  }
  
  console.log('\n=== Testing Direct KV Access ===')
  
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-derived`
    
    console.log(`\nFetching from: ${url.replace(CF_API_TOKEN, 'TOKEN_HIDDEN')}`)
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })
    
    console.log(`Response Status: ${response.status} ${response.statusText}`)
    
    if (response.ok) {
      const data = await response.json()
      
      if (Array.isArray(data)) {
        console.log(`\n✅ Successfully fetched derived NG list`)
        console.log(`Total video IDs: ${data.length}`)
        console.log(`First 5 IDs: ${data.slice(0, 5).join(', ')}`)
        
        // Check for duplicates
        const uniqueIds = new Set(data)
        if (uniqueIds.size < data.length) {
          console.log(`\n⚠️  Found ${data.length - uniqueIds.size} duplicate entries`)
        }
      } else {
        console.log('\n❌ Unexpected data format:', typeof data)
      }
    } else if (response.status === 404) {
      console.log('\n⚠️  Key not found: ng-list-derived')
      console.log('The derived NG list has not been created yet.')
    } else {
      const errorText = await response.text()
      console.log(`\n❌ Failed to fetch: ${errorText}`)
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error)
  }
  
  console.log('\n=== Recommendations ===')
  console.log('1. If environment variables are missing:')
  console.log('   - Add them to Vercel dashboard → Settings → Environment Variables')
  console.log('   - Redeploy the application')
  console.log('\n2. If key not found:')
  console.log('   - The derived NG list will be created when videos are blocked')
  console.log('   - Or run the update script to process existing data')
  console.log('\n3. If authentication fails:')
  console.log('   - Verify the API token has the correct permissions')
  console.log('   - Check if the namespace ID matches your KV namespace')
}

debugDerivedNGAPI().catch(console.error)