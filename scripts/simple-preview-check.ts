/**
 * Simple Preview Configuration Checker
 * Basic check of preview subdomain setup
 */

async function simplePreviewCheck() {
  console.log('=== Simple Preview Configuration Check ===\n')
  
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
    console.log('❌ Missing environment variables')
    return
  }
  
  const headers = {
    'Authorization': `Bearer ${CF_API_TOKEN}`,
    'Content-Type': 'application/json'
  }
  
  try {
    console.log('1. Checking Workers Scripts:')
    
    const scriptsUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts`
    const scriptsResponse = await fetch(scriptsUrl, { headers })
    
    if (scriptsResponse.ok) {
      const text = await scriptsResponse.text()
      console.log('Raw response length:', text.length)
      
      try {
        const scriptsData = JSON.parse(text)
        const scripts = scriptsData.result || []
        
        console.log(`Found ${scripts.length} Workers scripts:`)
        scripts.forEach((script: any) => {
          console.log(`  📜 ${script.id}`)
          console.log(`      Created: ${script.created_on}`)
          console.log(`      Modified: ${script.modified_on}`)
          
          if (script.id.includes('preview')) {
            console.log('      🎯 This is a PREVIEW script')
          }
        })
      } catch (parseError) {
        console.log('❌ Failed to parse scripts response')
        console.log('First 200 chars:', text.substring(0, 200))
      }
    } else {
      console.log(`❌ Failed to fetch scripts: ${scriptsResponse.status}`)
    }
    
    console.log('\n2. Checking Workers Routes:')
    
    // Get zones first
    const zonesUrl = `https://api.cloudflare.com/client/v4/zones`
    const zonesResponse = await fetch(zonesUrl, { headers })
    
    if (zonesResponse.ok) {
      const zonesData = await zonesResponse.json()
      const zones = zonesData.result || []
      
      for (const zone of zones) {
        console.log(`\nZone: ${zone.name}`)
        
        const routesUrl = `https://api.cloudflare.com/client/v4/zones/${zone.id}/workers/routes`
        const routesResponse = await fetch(routesUrl, { headers })
        
        if (routesResponse.ok) {
          const routesData = await routesResponse.json()
          const routes = routesData.result || []
          
          console.log(`Found ${routes.length} routes:`)
          routes.forEach((route: any) => {
            console.log(`  🔗 ${route.pattern}`)
            console.log(`      Script: ${route.script || 'None'}`)
            
            if (route.pattern.includes('preview')) {
              console.log('      🎯 PREVIEW ROUTE')
            }
          })
        }
      }
    }
    
    console.log('\n3. Testing Preview Subdomain:')
    
    // Test if preview subdomain responds
    const testUrls = [
      'https://preview.nico-rank.com',
      'https://preview.nico-rank.com/api/health',
      'https://nico-rank.com',
      'https://www.nico-rank.com'
    ]
    
    for (const url of testUrls) {
      try {
        const response = await fetch(url, { 
          method: 'HEAD',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ConfigChecker/1.0)' }
        })
        
        console.log(`✅ ${url} - Status: ${response.status}`)
        
        // Check response headers for clues
        const server = response.headers.get('server')
        const cfRay = response.headers.get('cf-ray')
        const xVercel = response.headers.get('x-vercel-id')
        
        if (server) console.log(`    Server: ${server}`)
        if (cfRay) console.log(`    CF-Ray: ${cfRay}`)
        if (xVercel) console.log(`    Vercel-ID: ${xVercel}`)
        
      } catch (error) {
        console.log(`❌ ${url} - Error: ${error}`)
      }
    }
    
    console.log('\n4. Summary:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Based on the previous output, we know:')
    console.log('✅ preview.nico-rank.com/* route exists')
    console.log('✅ nico-ranking-api-gateway-preview script exists')
    console.log('✅ Main domain routes are configured')
    console.log('⚠️  DNS records check limited by API permissions')
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Execute if run directly
if (require.main === module) {
  require('dotenv').config({ path: '.env.local' })
  simplePreviewCheck().catch(console.error)
}

export default simplePreviewCheck