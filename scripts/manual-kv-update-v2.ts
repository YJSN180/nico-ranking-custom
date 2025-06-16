#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv'
import * as path from 'path'
import { execSync } from 'child_process'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function manualUpdate() {
  console.log('Manual KV Update (Improved Version)')
  console.log('===================================\n')
  
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.error('Error: Cloudflare credentials not set')
    process.exit(1)
  }
  
  try {
    // Step 1: Check if there's recent data in temp keys
    console.log('Step 1: Checking for recent temp keys...')
    
    const listUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/keys?prefix=RANKING_TEMP_`
    
    const listResponse = await fetch(listUrl, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })
    
    if (listResponse.ok) {
      const data = await listResponse.json()
      const tempKeys = data.result || []
      
      if (tempKeys.length > 0) {
        console.log(`Found ${tempKeys.length} temp keys:`)
        tempKeys.forEach((key: any) => console.log(`  - ${key.name}`))
        
        // Use the most recent temp key
        const latestKey = tempKeys[0].name
        console.log(`\nUsing latest temp key: ${latestKey}`)
        
        // Copy from temp to main
        console.log('\nCopying temp key to RANKING_LATEST...')
        
        const getUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${latestKey}`
        const dataResponse = await fetch(getUrl, {
          headers: {
            'Authorization': `Bearer ${CF_API_TOKEN}`,
          },
        })
        
        if (dataResponse.ok) {
          const data = await dataResponse.arrayBuffer()
          
          const putUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`
          const putResponse = await fetch(putUrl, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${CF_API_TOKEN}`,
              'Content-Type': 'application/octet-stream',
            },
            body: data,
          })
          
          if (putResponse.ok) {
            console.log('✅ Successfully copied temp data to RANKING_LATEST!')
            
            // Verify
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
                updatedAt: new Date().toISOString(),
                restoredFrom: latestKey,
              }),
            })
            
            return
          } else {
            console.error(`Failed to copy: ${putResponse.status}`)
          }
        }
      } else {
        console.log('No temp keys found')
      }
    }
    
    // Step 2: Run full update if no temp keys available
    console.log('\nStep 2: Running full ranking update...')
    console.log('This will take about 2-3 minutes...\n')
    
    execSync('npx tsx scripts/update-ranking-github-action.ts', {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production'
      }
    })
    
    console.log('\n✅ Update completed!')
    
  } catch (error) {
    console.error('\n❌ Error:', error)
    process.exit(1)
  }
}

manualUpdate()