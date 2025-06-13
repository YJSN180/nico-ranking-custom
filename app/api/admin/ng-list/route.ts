import { NextRequest, NextResponse } from 'next/server'
import { getServerNGList, saveServerManualNGList } from '@/lib/ng-list-server'
import type { NGList } from '@/types/ng-list'

// 認証チェック（Basic認証またはBearer token）
function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return false
  }
  
  // Bearer token認証（内部APIアクセス用）
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]
    const validToken = process.env.CRON_SECRET
    return !!validToken && token === validToken
  }
  
  // Basic認証（管理画面用）
  if (authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.split(' ')[1]
    const credentials = Buffer.from(base64Credentials!, 'base64').toString('ascii')
    const [username, password] = credentials.split(':')
    
    // 環境変数で認証情報を管理
    const validUsername = process.env.ADMIN_USERNAME || 'admin'
    const validPassword = process.env.ADMIN_PASSWORD || 'password'
    
    return username === validUsername && password === validPassword
  }
  
  return false
}

// NGリストを取得
export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Admin Area"' }
    })
  }
  
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
  if (!checkAuth(request)) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Admin Area"' }
    })
  }
  
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
    return NextResponse.json({ error: 'Failed to save NG list' }, { status: 500 })
  }
}