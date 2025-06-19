import { NextRequest, NextResponse } from 'next/server'
import { getDerivativeNGListFromKV, getDerivativeNGStats } from '@/lib/ng-list-derivative'

export async function GET(request: NextRequest) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // First try to get from the old KV structure (ng-list-derived key)
    let derivedVideoIds: string[] = []
    let lastUpdated: string | null = null
    let totalBlocked = 0
    
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
    
    if (CF_ACCOUNT_ID && CF_NAMESPACE_ID && CF_API_TOKEN) {
      try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-derived`, {
          headers: {
            "Authorization": `Bearer ${CF_API_TOKEN}`
          }
        })
        
        if (response.ok) {
          derivedVideoIds = await response.json()
          totalBlocked = derivedVideoIds.length
          lastUpdated = new Date().toISOString() // Approximate
        }
      } catch (error) {
        console.warn('Failed to fetch from ng-list-derived key:', error)
      }
    }
    
    return NextResponse.json({
      videoIds: derivedVideoIds,
      count: totalBlocked,
      lastUpdated: lastUpdated,
      totalVideosProcessed: 0 // Not available in old structure
    })
  } catch (error) {
    console.error('Failed to fetch derived NG list:', error)
    return NextResponse.json({ error: 'Failed to fetch derived NG list' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // TODO: Implement clear derived NG list functionality
    // For now, return success as derived list is embedded in ranking data
    return NextResponse.json({ success: true, message: 'Derived NG list clearing not implemented - data is embedded in ranking data' })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to clear derived NG list' }, { status: 500 })
  }
}