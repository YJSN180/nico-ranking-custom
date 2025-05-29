import { NextResponse } from 'next/server'

export async function GET() {
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'
    
  const tests = [
    { name: 'Compare Sources', endpoint: '/api/test-scraping/compare-sources' },
    { name: 'API Exploration', endpoint: '/api/test-scraping/api-exploration' },
    { name: 'Auth Test', endpoint: '/api/test-scraping/auth-test' },
    { name: 'Snapshot API', endpoint: '/api/test-scraping/snapshot-api' },
    { name: 'Web Scraping', endpoint: '/api/test-scraping/web-scrape' },
    { name: 'Undocumented APIs', endpoint: '/api/test-scraping/undocumented-api' }
  ]
  
  const results: any = {}
  const summary: any = {
    testedApproaches: [],
    workingSolutions: [],
    partialSolutions: [],
    failedApproaches: [],
    recommendations: []
  }
  
  // Run all tests
  for (const test of tests) {
    try {
      const response = await fetch(`${baseUrl}${test.endpoint}`)
      if (response.ok) {
        results[test.name] = await response.json()
      } else {
        results[test.name] = { error: `Failed with status ${response.status}` }
      }
    } catch (error) {
      results[test.name] = { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }
  
  // Analyze results
  
  // 1. Compare Sources Analysis
  if (results['Compare Sources'] && !results['Compare Sources'].error) {
    const compareData = results['Compare Sources']
    summary.testedApproaches.push('RSS vs nvapi comparison')
    
    if (compareData.missingInNvapi && compareData.missingInNvapi.length > 0) {
      summary.findings = {
        missingVideosCount: compareData.stats?.missingInNvapiCount,
        missingVideos: compareData.missingInNvapi.map((v: any) => ({
          id: v.id,
          title: v.title,
          rank: v.rank,
          hasSensitiveKeywords: v.titleContainsSensitiveKeywords,
          videoDetails: v.videoDetails
        }))
      }
      
      // Check if videos are accessible individually
      const accessibleMissing = compareData.missingInNvapi.filter((v: any) => 
        v.videoDetails && v.videoDetails.status === 200
      )
      
      if (accessibleMissing.length > 0) {
        summary.partialSolutions.push({
          approach: 'Individual video fetching',
          description: 'Missing videos can be fetched individually via nvapi',
          limitation: 'Requires knowing video IDs beforehand'
        })
      }
    }
  }
  
  // 2. API Exploration Analysis
  if (results['API Exploration'] && !results['API Exploration'].error) {
    const apiData = results['API Exploration']
    
    // Check which endpoints returned data
    Object.entries(apiData.rankingEndpointTests || {}).forEach(([key, value]: [string, any]) => {
      if (value.itemCount > 0) {
        summary.testedApproaches.push(`API endpoint: ${key}`)
        
        if (value.itemCount > 100) {
          summary.workingSolutions.push({
            approach: key,
            itemCount: value.itemCount,
            hasRestrictedContent: value.hasRestrictedContent
          })
        }
      }
    })
    
    // Check if mobile/app APIs return different results
    const mobileTest = apiData.rankingEndpointTests?.nvapi_ranking_mobile
    const appTest = apiData.rankingEndpointTests?.nvapi_ranking_app
    
    if (mobileTest?.itemCount !== apiData.rankingEndpointTests?.nvapi_v1_ranking?.itemCount) {
      summary.partialSolutions.push({
        approach: 'Mobile API',
        description: 'Mobile API returns different item count',
        itemCount: mobileTest?.itemCount
      })
    }
  }
  
  // 3. Auth Test Analysis
  if (results['Auth Test'] && !results['Auth Test'].error) {
    const authData = results['Auth Test'].tests
    
    if (authData?.rankingWithCookies?.itemCount > 0) {
      summary.testedApproaches.push('Cookie-based authentication')
    }
    
    Object.entries(authData || {}).forEach(([key, value]: [string, any]) => {
      if (value.hasRestrictedContent) {
        summary.workingSolutions.push({
          approach: `Authentication method: ${key}`,
          description: 'Successfully retrieved restricted content'
        })
      }
    })
  }
  
  // 4. Snapshot API Analysis
  if (results['Snapshot API'] && !results['Snapshot API'].error) {
    const snapshotData = results['Snapshot API'].results
    
    summary.testedApproaches.push('Snapshot API v2')
    
    if (snapshotData?.basicSnapshot?.itemCount > 0) {
      summary.partialSolutions.push({
        approach: 'Snapshot API',
        description: 'Can fetch videos with metadata',
        itemCount: snapshotData.basicSnapshot.itemCount,
        limitation: 'May not match exact nvapi ranking order'
      })
    }
    
    // Check if missing videos are found
    const video1Found = snapshotData?.video_sm44197856?.found
    const video2Found = snapshotData?.video_sm44205605?.found
    
    if (video1Found || video2Found) {
      summary.findings.missingVideosInSnapshot = {
        sm44197856: video1Found,
        sm44205605: video2Found
      }
    }
  }
  
  // 5. Web Scraping Analysis
  if (results['Web Scraping'] && !results['Web Scraping'].error) {
    const scrapeData = results['Web Scraping'].results
    
    summary.testedApproaches.push('Web scraping')
    
    if (scrapeData?.htmlScraping?.videosFound > 0) {
      const hasTargetVideos = scrapeData.htmlScraping.containsTargetVideos?.sm44197856 || 
                              scrapeData.htmlScraping.containsTargetVideos?.sm44205605
      
      if (hasTargetVideos) {
        summary.workingSolutions.push({
          approach: 'HTML web scraping',
          description: 'Successfully found sensitive videos in HTML',
          videosFound: scrapeData.htmlScraping.videosFound,
          containsTargetVideos: scrapeData.htmlScraping.containsTargetVideos
        })
      }
    }
  }
  
  // 6. Undocumented API Analysis
  if (results['Undocumented APIs'] && !results['Undocumented APIs'].error) {
    const undocData = results['Undocumented APIs'].results
    
    Object.entries(undocData || {}).forEach(([key, value]: [string, any]) => {
      if (value.itemCount > 0 || value.hasData) {
        summary.testedApproaches.push(`Undocumented: ${key}`)
        
        if (value.itemCount > 100) {
          summary.partialSolutions.push({
            approach: key,
            itemCount: value.itemCount
          })
        }
      }
    })
  }
  
  // Generate recommendations
  if (summary.workingSolutions.length > 0) {
    summary.recommendations.push({
      priority: 'HIGH',
      approach: 'Web scraping fallback',
      description: 'Implement HTML scraping as fallback when nvapi misses videos',
      reason: 'HTML contains all videos including sensitive ones'
    })
  }
  
  if (summary.partialSolutions.some((s: any) => s.approach === 'Snapshot API')) {
    summary.recommendations.push({
      priority: 'MEDIUM',
      approach: 'Hybrid approach',
      description: 'Combine nvapi for main ranking + Snapshot API for missing videos',
      reason: 'Snapshot API can access individual videos that nvapi misses'
    })
  }
  
  summary.recommendations.push({
    priority: 'LOW',
    approach: 'Monitor RSS deprecation',
    description: 'Continue using RSS until officially deprecated, then switch to web scraping',
    reason: 'RSS currently provides complete data'
  })
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    summary,
    detailedResults: results
  })
}