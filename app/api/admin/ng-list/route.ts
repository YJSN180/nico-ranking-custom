import { NextRequest, NextResponse } from 'next/server'
import { getNGList, saveManualNGList } from '@/lib/ng-filter'
import type { NGList } from '@/types/ng-list'

// Basic認証チェック
function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false
  }
  
  const base64Credentials = authHeader.split(' ')[1]
  const credentials = Buffer.from(base64Credentials!, 'base64').toString('ascii')
  const [username, password] = credentials.split(':')
  
  // 環境変数で認証情報を管理
  const validUsername = process.env.ADMIN_USERNAME || 'admin'
  const validPassword = process.env.ADMIN_PASSWORD || 'password'
  
  return username === validUsername && password === validPassword
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
    const ngList = await getNGList()
    return NextResponse.json(ngList)
  } catch (error) {
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
    
    await saveManualNGList(manualList)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save NG list' }, { status: 500 })
  }
}