#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function testKVWrite() {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.error('Cloudflare credentials not configured')
    process.exit(1)
  }
  
  console.log('Testing KV Write...\n')
  
  // Test 1: Write to a simple test key
  const testKey = `TEST_KEY_${Date.now()}`
  const testUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${testKey}`
  
  console.log(`Writing to test key: ${testKey}`)
  
  try {
    const response = await fetch(testUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'text/plain',
      },
      body: 'Test data ' + new Date().toISOString(),
    })
    
    console.log(`Response status: ${response.status}`)
    console.log(`Response headers:`)
    response.headers.forEach((value, key) => {
      if (key.toLowerCase().includes('rate') || key.toLowerCase().includes('limit')) {
        console.log(`  ${key}: ${value}`)
      }
    })
    
    const responseText = await response.text()
    console.log(`Response body: ${responseText}`)
    
    if (response.ok) {
      console.log('\n✅ Write successful!')
      
      // Try to read it back
      const readResponse = await fetch(testUrl, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
      })
      
      if (readResponse.ok) {
        const data = await readResponse.text()
        console.log(`Read back: ${data}`)
      }
      
      // Clean up
      await fetch(testUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
      })
      console.log('Cleaned up test key')
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
  
  // Test 2: Check account limits
  console.log('\n\nChecking account info...')
  const accountUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}`
  
  try {
    const response = await fetch(accountUrl, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })
    
    console.log(`Account info status: ${response.status}`)
    const data = await response.json()
    console.log('Account info:', JSON.stringify(data, null, 2))
  } catch (error) {
    console.error('Error checking account:', error)
  }
}

testKVWrite()