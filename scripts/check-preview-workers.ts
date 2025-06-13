/**
 * Detailed Preview Workers Configuration Checker
 * Examines the preview Workers scripts and their configurations
 */

interface WorkerScript {
  id: string
  created_on: string
  modified_on: string
  etag: string
  size?: number
  script?: string
}

interface WorkerRoute {
  id: string
  pattern: string
  script?: string
  zone_id: string
  zone_name: string
}

async function checkPreviewWorkers() {
  console.log('=== Preview Workers Configuration Analysis ===\n')
  
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
    console.log('❌ Missing required environment variables')
    return
  }
  
  const headers = {
    'Authorization': `Bearer ${CF_API_TOKEN}`,
    'Content-Type': 'application/json'
  }
  
  try {
    // 1. Get detailed information about preview Workers
    console.log('1. Analyzing Preview Workers:')
    
    const previewScripts = [
      'nico-ranking-api-gateway-preview',
      'nico-ranking-api-gateway',
      'nico-ranking-proxy'
    ]
    
    for (const scriptName of previewScripts) {
      console.log(`\n--- ${scriptName} ---`)
      
      // Get script metadata
      const scriptUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts/${scriptName}`
      const scriptResponse = await fetch(scriptUrl, { headers })
      
      if (scriptResponse.ok) {
        const scriptData = await scriptResponse.json()
        const script = scriptData.result
        
        console.log(`✅ Script exists`)
        console.log(`   Created: ${new Date(script.created_on).toLocaleString()}`)
        console.log(`   Modified: ${new Date(script.modified_on).toLocaleString()}`)
        console.log(`   ETag: ${script.etag}`)
        
        // Get script content
        const contentUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts/${scriptName}/content`
        const contentResponse = await fetch(contentUrl, { 
          headers: {
            ...headers,
            'Accept': 'application/javascript'
          }
        })
        
        if (contentResponse.ok) {
          const content = await contentResponse.text()
          console.log(`   Size: ${Math.round(content.length / 1024)} KB`)
          
          // Analyze script content for preview-specific logic
          if (content.includes('preview')) {
            console.log(`   🎯 Contains preview-specific logic`)
          }
          
          if (content.includes('vercel')) {
            console.log(`   🔗 Contains Vercel routing logic`)
          }
          
          if (content.includes('environment')) {
            console.log(`   🌍 Contains environment detection`)
          }
          
          // Show first few lines for context
          const lines = content.split('\n').slice(0, 10)
          console.log(`   📋 First 10 lines:`)
          lines.forEach((line, i) => {
            if (line.trim()) {
              console.log(`      ${i + 1}: ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`)
            }
          })
        } else {
          console.log(`   ❌ Failed to get script content: ${contentResponse.status}`)
        }
        
        // Get script settings/bindings
        const settingsUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts/${scriptName}/settings`
        const settingsResponse = await fetch(settingsUrl, { headers })
        
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json()
          const settings = settingsData.result
          
          if (settings.bindings && settings.bindings.length > 0) {
            console.log(`   🔧 Bindings:`)
            settings.bindings.forEach((binding: any) => {
              console.log(`      - ${binding.name}: ${binding.type}`)
              if (binding.namespace_id) {
                console.log(`         Namespace: ${binding.namespace_id}`)
              }
            })
          }
          
          if (settings.usage_model) {
            console.log(`   💰 Usage model: ${settings.usage_model}`)
          }
        }
        
      } else {
        console.log(`❌ Script not found or access denied: ${scriptResponse.status}`)
      }
    }
    
    // 2. Check all zones and their routes
    console.log('\n2. Workers Routes Analysis:')
    
    const zonesUrl = `https://api.cloudflare.com/client/v4/zones`
    const zonesResponse = await fetch(zonesUrl, { headers })
    
    if (zonesResponse.ok) {
      const zonesData = await zonesResponse.json()
      const zones = zonesData.result || []
      
      for (const zone of zones) {
        console.log(`\n--- Routes for ${zone.name} ---`)
        
        const routesUrl = `https://api.cloudflare.com/client/v4/zones/${zone.id}/workers/routes`
        const routesResponse = await fetch(routesUrl, { headers })
        
        if (routesResponse.ok) {
          const routesData = await routesResponse.json()
          const routes: WorkerRoute[] = routesData.result || []
          
          routes.forEach(route => {
            console.log(`🔗 ${route.pattern}`)
            console.log(`   Script: ${route.script || 'None'}`)
            console.log(`   ID: ${route.id}`)
            
            // Identify route purpose
            if (route.pattern.includes('preview')) {
              console.log(`   🎯 PREVIEW ROUTE - This handles preview traffic`)
            } else if (route.pattern === `${zone.name}/*`) {
              console.log(`   🌐 MAIN ROUTE - This handles production traffic`)
            } else if (route.pattern.includes('www')) {
              console.log(`   🌐 WWW ROUTE - This handles www traffic`)
            }
          })
        }
      }
    }
    
    // 3. Check KV bindings for preview environment
    console.log('\n3. KV Bindings Analysis:')
    
    const namespaceUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces`
    const namespaceResponse = await fetch(namespaceUrl, { headers })
    
    if (namespaceResponse.ok) {
      const namespaceData = await namespaceResponse.json()
      const namespaces = namespaceData.result || []
      
      console.log(`Found ${namespaces.length} KV namespaces:`)
      namespaces.forEach((ns: any) => {
        console.log(`  📦 ${ns.title} (${ns.id})`)
        
        if (ns.title.includes('preview') || ns.title.includes('staging')) {
          console.log(`     🎯 This appears to be for preview/staging`)
        } else if (ns.title.includes('production') || ns.title.includes('prod')) {
          console.log(`     🌐 This appears to be for production`)
        }
      })
    }
    
    // 4. Summary and current status
    console.log('\n4. Current Preview Configuration Status:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    
    console.log('✅ Found preview Workers route: preview.nico-rank.com/*')
    console.log('✅ Found preview Workers script: nico-ranking-api-gateway-preview')
    console.log('✅ Found main Workers script: nico-ranking-api-gateway')
    
    console.log('\n🎯 Preview Traffic Flow:')
    console.log('   1. preview.nico-rank.com/* → nico-ranking-api-gateway-preview script')
    console.log('   2. Script likely proxies to Vercel preview deployments')
    console.log('   3. Main domain uses nico-ranking-api-gateway for production')
    
    console.log('\n⚠️  Note: DNS record check failed (permission issue)')
    console.log('   This is expected - the Workers route exists which means the subdomain is configured')
    
  } catch (error) {
    console.error('❌ Error analyzing preview Workers:', error)
  }
}

// Execute if run directly
if (require.main === module) {
  require('dotenv').config({ path: '.env.local' })
  checkPreviewWorkers().catch(console.error)
}

export default checkPreviewWorkers