import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // /admin配下のすべてのパスで認証を要求
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const authHeader = request.headers.get('authorization')
    
    // 認証ヘッダーがない場合
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return new NextResponse('Authentication required', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Admin Area"',
        },
      })
    }
    
    // 認証情報をチェック
    try {
      const base64Credentials = authHeader.split(' ')[1]
      const credentials = Buffer.from(base64Credentials!, 'base64').toString('ascii')
      const [username, password] = credentials.split(':')
      
      const validUsername = process.env.ADMIN_USERNAME || 'admin'
      const validPassword = process.env.ADMIN_PASSWORD || 'password'
      
      if (username !== validUsername || password !== validPassword) {
        return new NextResponse('Invalid credentials', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="Admin Area"',
          },
        })
      }
    } catch {
      return new NextResponse('Invalid authentication format', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Admin Area"',
        },
      })
    }
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: '/admin/:path*'
}