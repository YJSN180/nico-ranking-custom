// 内部プロキシAPI - 削除予定（セキュリティリスクのため）
// このエンドポイントは本番環境では無効化されています

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  // 本番環境では完全に無効化
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not Found' },
      { status: 404 }
    )
  }

  // 開発環境でも警告を表示
  console.warn('[SECURITY WARNING] Internal proxy endpoint accessed - this should be removed')
  
  return NextResponse.json(
    { 
      error: 'This endpoint has been disabled for security reasons',
      message: 'Please use the official API endpoints instead'
    },
    { status: 410 } // 410 Gone
  )
}