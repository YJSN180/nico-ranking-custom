import { NextRequest, NextResponse } from 'next/server'
import { updateRankingData } from '@/scripts/update-ranking-kv'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // Simple admin key check
    const adminKey = request.headers.get('x-admin-key')
    if (adminKey !== process.env.ADMIN_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // トリガーからの更新を実行
    const result = await updateRankingData()
    
    if (!result.success) {
      return NextResponse.json({ 
        error: 'Update failed',
        details: result.error,
        failedGenres: result.failedGenres 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true,
      updatedGenres: result.updatedGenres,
      failedGenres: result.failedGenres || [],
      timestamp: new Date().toISOString(),
      message: 'Data updated successfully'
    })
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Update failed', 
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}