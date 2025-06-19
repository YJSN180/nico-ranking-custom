import { NextRequest, NextResponse } from 'next/server'
import { getNGListManual, setNGListManual } from '@/lib/ng-list-server'

export async function GET(request: NextRequest) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get manual NG list
    const manualNGList = await getNGListManual()
    
    // Get derived NG list from Edge Function
    // Use absolute URL for internal API call
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    const host = request.headers.get('host') || request.headers.get('x-forwarded-host') || 'localhost:3000'
    const baseUrl = `${protocol}://${host}`
    
    const derivedResponse = await fetch(`${baseUrl}/api/edge/admin/ng-list-derived`, {
      headers: {
        'authorization': authHeader || '',
        'cookie': request.headers.get('cookie') || ''
      }
    })
    
    let derivedVideoIds: string[] = []
    if (derivedResponse.ok) {
      const derivedData = await derivedResponse.json()
      derivedVideoIds = derivedData.videoIds || []
    } else {
      // Log error for debugging but don't fail the whole request
      console.error(`Failed to fetch derived NG list: ${derivedResponse.status} ${derivedResponse.statusText}`)
      // Continue with empty derived list
    }
    
    // Combine manual and derived lists
    const fullNGList = {
      ...manualNGList,
      derivedVideoIds
    }
    
    return NextResponse.json(fullNGList)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch NG list' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const ngList = await request.json()
    
    // Validate the structure
    if (!ngList.videoIds || !ngList.authorIds || !ngList.videoTitles || !ngList.authorNames) {
      return NextResponse.json({ error: 'Invalid NG list format' }, { status: 400 })
    }

    // Save to Cloudflare KV
    await setNGListManual(ngList)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update NG list' }, { status: 500 })
  }
}
