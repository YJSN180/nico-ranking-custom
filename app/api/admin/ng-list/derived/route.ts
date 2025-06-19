import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Only use the secure ng-list-derived key
    // DO NOT include NG data in public ranking data for security reasons
    let derivedVideoIds: string[] = []
    let lastUpdated: string | null = null
    let totalBlocked = 0
    
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
    
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      // Missing Cloudflare credentials
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
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
        // Found entries in ng-list-derived key
      } else if (response.status === 404) {
        // ng-list-derived key not found, returning empty list
      } else {
        // Failed to fetch ng-list-derived
      }
    } catch (error) {
      // Failed to fetch from ng-list-derived key
    }
    
    return NextResponse.json({
      videoIds: derivedVideoIds,
      count: totalBlocked,
      lastUpdated: lastUpdated,
      totalVideosProcessed: 0 // Not available in current structure
    })
  } catch (error) {
    // Failed to fetch derived NG list
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
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
    
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
    // Clear the ng-list-derived key
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-derived`,
      {
        method: 'DELETE',
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`
        }
      }
    )
    
    if (response.ok || response.status === 404) {
      return NextResponse.json({ success: true, message: 'Derived NG list cleared successfully' })
    } else {
      // Failed to delete ng-list-derived
      return NextResponse.json({ error: 'Failed to clear derived NG list' }, { status: 500 })
    }
  } catch (error) {
    // Failed to clear derived NG list
    return NextResponse.json({ error: 'Failed to clear derived NG list' }, { status: 500 })
  }
}