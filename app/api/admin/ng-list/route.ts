import { NextRequest, NextResponse } from 'next/server'
import { getServerNGList, saveServerManualNGList } from '@/lib/ng-list-server'
import type { NGList } from '@/types/ng-list'

// Note: Authentication is handled by middleware.ts for /api/admin/* routes
// This route will only be accessible if the user has already passed Basic auth

// NGリストを取得
export async function GET() {
  try {
    const ngList = await getServerNGList()
    return NextResponse.json(ngList)
  } catch (error) {
    console.error('Failed to get NG list:', error)
    return NextResponse.json({ error: 'Failed to get NG list' }, { status: 500 })
  }
}

// NGリストを保存
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const manualList: Omit<NGList, 'derivedVideoIds'> = {
      videoIds: data.videoIds || [],
      videoTitles: data.videoTitles || [],
      authorIds: data.authorIds || [],
      authorNames: data.authorNames || []
    }
    
    await saveServerManualNGList(manualList)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save NG list:', error)
    return NextResponse.json({ error: 'Failed to save NG list' }, { status: 500 })
  }
}