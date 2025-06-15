import { NextRequest, NextResponse } from 'next/server'
import { getServerDerivedNGList, clearServerDerivedNGList } from '@/lib/ng-list-server'

export async function GET(request: NextRequest) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const derivedList = await getServerDerivedNGList()
    return NextResponse.json({
      videoIds: derivedList,
      lastUpdated: new Date().toISOString()
    })
  } catch (error) {
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
    await clearServerDerivedNGList()
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to clear derived NG list' }, { status: 500 })
  }
}