/**
 * Cloudflare Preview Subdomain Configuration Checker
 * Checks for DNS records and Workers routes for preview subdomains
 */

interface DNSRecord {
  id: string
  name: string
  type: string
  content: string
  proxied?: boolean
  ttl?: number
  zone_id: string
  zone_name: string
}

interface WorkersRoute {
  id: string
  pattern: string
  script?: string
  zone_id: string
  zone_name: string
}

interface Zone {
  id: string
  name: string
  status: string
}

async function checkPreviewDomains() {
  console.log('=== Cloudflare Preview Subdomain Configuration Check ===\n')
  
  // Environment variables check
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  
  if (!CF_API_TOKEN) {
    console.log('❌ CLOUDFLARE_KV_API_TOKEN not set')
    console.log('Please set it in .env.local')
    return
  }
  
  if (!CF_ACCOUNT_ID) {
    console.log('❌ CLOUDFLARE_ACCOUNT_ID not set')
    console.log('Please set it in .env.local')
    return
  }
  
  console.log('Configuration:')
  console.log(`- Account ID: ${CF_ACCOUNT_ID.substring(0, 8)}...`)
  console.log(`- API Token: [HIDDEN]\n`)
  
  const headers = {
    'Authorization': `Bearer ${CF_API_TOKEN}`,
    'Content-Type': 'application/json'
  }
  
  try {
    // 1. Get all zones
    console.log('1. Fetching Zones:')
    const zonesUrl = `https://api.cloudflare.com/client/v4/zones`
    const zonesResponse = await fetch(zonesUrl, { headers })
    
    if (!zonesResponse.ok) {
      console.log(`❌ Failed to fetch zones: ${zonesResponse.status}`)
      return
    }
    
    const zonesData = await zonesResponse.json()
    const zones: Zone[] = zonesData.result || []
    
    console.log(`Found ${zones.length} zones:`)
    zones.forEach(zone => {
      console.log(`  - ${zone.name} (${zone.id.substring(0, 8)}...) [${zone.status}]`)
    })
    
    // 2. Check DNS records for each zone
    console.log('\n2. Checking DNS Records for Preview Subdomains:')
    
    for (const zone of zones) {
      console.log(`\n--- Zone: ${zone.name} ---`)
      
      const dnsUrl = `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`
      const dnsResponse = await fetch(dnsUrl, { headers })
      
      if (!dnsResponse.ok) {
        console.log(`❌ Failed to fetch DNS records for ${zone.name}: ${dnsResponse.status}`)
        continue
      }
      
      const dnsData = await dnsResponse.json()
      const records: DNSRecord[] = dnsData.result || []
      
      // Filter for preview-related subdomains
      const previewRecords = records.filter(record => 
        record.name.includes('preview') || 
        record.name.includes('staging') ||
        record.name.includes('dev') ||
        record.name.includes('test') ||
        record.name.includes('branch') ||
        record.name.match(/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+\./i) // Vercel-style preview URLs
      )
      
      if (previewRecords.length > 0) {
        console.log(`Found ${previewRecords.length} preview-related DNS records:`)
        previewRecords.forEach(record => {
          console.log(`  📋 ${record.name} (${record.type}) → ${record.content}`)
          console.log(`      Proxied: ${record.proxied ? '✅' : '❌'}, TTL: ${record.ttl}`)
        })
      } else {
        console.log('No preview-related DNS records found')
      }
      
      // Show all DNS records for the domain (limited output)
      console.log(`\nAll DNS records (${records.length} total):`)
      records.slice(0, 10).forEach(record => {
        console.log(`  • ${record.name} (${record.type}) → ${record.content.substring(0, 50)}${record.content.length > 50 ? '...' : ''}`)
      })
      if (records.length > 10) {
        console.log(`  ... and ${records.length - 10} more records`)
      }
    }
    
    // 3. Check Workers routes
    console.log('\n3. Checking Workers Routes:')
    
    for (const zone of zones) {
      console.log(`\n--- Workers Routes for ${zone.name} ---`)
      
      const routesUrl = `https://api.cloudflare.com/client/v4/zones/${zone.id}/workers/routes`
      const routesResponse = await fetch(routesUrl, { headers })
      
      if (!routesResponse.ok) {
        console.log(`❌ Failed to fetch Workers routes for ${zone.name}: ${routesResponse.status}`)
        continue
      }
      
      const routesData = await routesResponse.json()
      const routes: WorkersRoute[] = routesData.result || []
      
      if (routes.length > 0) {
        console.log(`Found ${routes.length} Workers routes:`)
        routes.forEach(route => {
          console.log(`  🔗 ${route.pattern}`)
          if (route.script) {
            console.log(`      Script: ${route.script}`)
          }
          
          // Check if route might handle preview traffic
          const isPreviewRoute = route.pattern.includes('preview') || 
                                route.pattern.includes('*') ||
                                route.pattern.includes('staging') ||
                                route.pattern.includes('dev')
          
          if (isPreviewRoute) {
            console.log('      🎯 Potentially handles preview traffic')
          }
        })
      } else {
        console.log('No Workers routes found')
      }
    }
    
    // 4. Check for Workers scripts
    console.log('\n4. Checking Workers Scripts:')
    
    const scriptsUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts`
    const scriptsResponse = await fetch(scriptsUrl, { headers })
    
    if (scriptsResponse.ok) {
      const scriptsData = await scriptsResponse.json()
      const scripts = scriptsData.result || []
      
      console.log(`Found ${scripts.length} Workers scripts:`)
      scripts.forEach((script: any) => {
        console.log(`  📜 ${script.id}`)
        if (script.created_on) {
          const createdDate = new Date(script.created_on).toLocaleDateString()
          console.log(`      Created: ${createdDate}`)
        }
        if (script.modified_on) {
          const modifiedDate = new Date(script.modified_on).toLocaleDateString()
          console.log(`      Modified: ${modifiedDate}`)
        }
      })
    } else {
      console.log(`❌ Failed to fetch Workers scripts: ${scriptsResponse.status}`)
    }
    
    // 5. Check for Pages projects (which might conflict)
    console.log('\n5. Checking Pages Projects:')
    
    const pagesUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects`
    const pagesResponse = await fetch(pagesUrl, { headers })
    
    if (pagesResponse.ok) {
      const pagesData = await pagesResponse.json()
      const projects = pagesData.result || []
      
      if (projects.length > 0) {
        console.log(`Found ${projects.length} Pages projects:`)
        projects.forEach((project: any) => {
          console.log(`  📄 ${project.name}`)
          console.log(`      Production domain: ${project.canonical_deployment?.url || 'N/A'}`)
          if (project.domains && project.domains.length > 0) {
            console.log(`      Custom domains: ${project.domains.join(', ')}`)
          }
          
          // Check if this might interfere with preview domains
          const mightInterfere = project.name.includes('nico') || 
                               project.canonical_deployment?.url?.includes('nico')
          
          if (mightInterfere) {
            console.log('      ⚠️  Might interfere with preview domains')
          }
        })
      } else {
        console.log('No Pages projects found')
      }
    } else {
      console.log(`❌ Failed to fetch Pages projects: ${pagesResponse.status}`)
    }
    
    // 6. Summary and recommendations
    console.log('\n6. Summary and Recommendations:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    
    // Look for preview.nico-rank.com specifically
    let hasPreviewDomain = false
    for (const zone of zones) {
      if (zone.name === 'nico-rank.com') {
        const dnsUrl = `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records?name=preview.nico-rank.com`
        const dnsResponse = await fetch(dnsUrl, { headers })
        
        if (dnsResponse.ok) {
          const dnsData = await dnsResponse.json()
          if (dnsData.result && dnsData.result.length > 0) {
            hasPreviewDomain = true
            console.log('✅ preview.nico-rank.com DNS record exists')
            dnsData.result.forEach((record: DNSRecord) => {
              console.log(`   ${record.type}: ${record.content}`)
            })
          }
        }
        break
      }
    }
    
    if (!hasPreviewDomain) {
      console.log('❌ No preview.nico-rank.com DNS record found')
      console.log('💡 To set up preview subdomain:')
      console.log('   1. Add CNAME record: preview.nico-rank.com → vercel-preview-url')
      console.log('   2. Or add A record pointing to Vercel IP')
      console.log('   3. Configure Workers route for preview.nico-rank.com/*')
    }
    
  } catch (error) {
    console.error('❌ Error checking preview domains:', error)
  }
}

// Execute if run directly
if (require.main === module) {
  require('dotenv').config({ path: '.env.local' })
  checkPreviewDomains().catch(console.error)
}

export default checkPreviewDomains