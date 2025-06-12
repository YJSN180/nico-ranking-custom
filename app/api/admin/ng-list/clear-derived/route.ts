import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@/lib/simple-kv'

// Basic認証チェック
function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false
  }
  
  const base64Credentials = authHeader.split(' ')[1]
  const credentials = Buffer.from(base64Credentials!, 'base64').toString('ascii')
  const [username, password] = credentials.split(':')
  
  const validUsername = process.env.ADMIN_USERNAME || 'admin'
  const validPassword = process.env.ADMIN_PASSWORD || 'password'
  
  return username === validUsername && password === validPassword
}

// 派生NGリストをクリア
export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Admin Area"' }
    })
  }
  
  try {
    await kv.del('ng-list-derived')
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to clear derived NG list' }, { status: 500 })
  }
}