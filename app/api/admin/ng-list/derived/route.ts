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
    const [derivativeData, stats] = await Promise.all([
      getDerivativeNGListFromKV(),
      getDerivativeNGStats()
    ])
    
    return NextResponse.json({
      videoIds: derivativeData?.blockedVideoIds || [],
      count: stats?.totalBlocked || 0,
      lastUpdated: stats?.lastUpdated || null,
      totalVideosProcessed: stats?.totalVideosProcessed || 0
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