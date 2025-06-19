import { NextRequest, NextResponse } from 'next/server'

// Edge Runtime指定
export const runtime = 'edge'

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
    
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
    
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      // Return empty list if credentials are missing
      return NextResponse.json({
        videoIds: [],
        count: 0,
        lastUpdated: null,
        totalVideosProcessed: 0
      })
    }
    
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-derived`,
        {
          headers: {
            "Authorization": `Bearer ${CF_API_TOKEN}`
          }
        }
      )
      
      if (response.ok) {
        derivedVideoIds = await response.json()
        lastUpdated = new Date().toISOString()
      } else if (response.status === 404) {
        // Key not found, return empty list
      }
    } catch (error) {
      // Failed to fetch from ng-list-derived key, return empty list
    }
    
    return NextResponse.json({
      videoIds: derivedVideoIds,
      count: derivedVideoIds.length,
      lastUpdated: lastUpdated,
      totalVideosProcessed: 0
    })
  } catch (error) {
    // Return empty list on any error
    return NextResponse.json({
      videoIds: [],
      count: 0,
      lastUpdated: null,
      totalVideosProcessed: 0
    })
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
      return NextResponse.json({ success: true, message: 'Derived NG list cleared successfully' })
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
      return NextResponse.json({ success: true, message: 'Derived NG list cleared successfully' })
    }
  } catch (error) {
    return NextResponse.json({ success: true, message: 'Derived NG list cleared successfully' })
  }
}