import { NextRequest, NextResponse } from 'next/server'
import { getNGListManual, setNGListManual } from '@/lib/ng-list-server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Dynamic import to ensure environment variables are loaded at runtime
    const { getServerNGList } = await import('@/lib/ng-list-server')
    const ngList = await getServerNGList()
    
    return NextResponse.json(ngList)
  } catch (error) {
    console.error('Failed to fetch NG list:', error)
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
