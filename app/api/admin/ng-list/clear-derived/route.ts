import { NextResponse } from 'next/server'
import { kv } from '@/lib/simple-kv'

// Note: Authentication is handled by middleware.ts for /api/admin/* routes
// This route will only be accessible if the user has already passed Basic auth

// 派生NGリストをクリア
export async function POST() {
  try {
    await kv.del('ng-list-derived')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to clear derived NG list:', error)
    return NextResponse.json({ error: 'Failed to clear derived NG list' }, { status: 500 })
  }
}