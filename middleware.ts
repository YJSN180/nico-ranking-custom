import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// シンプルなインメモリレート制限（本番ではRedisやCloudflareを使用）
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string, limit: number = 10, windowMs: number = 10000): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)
  
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }
  
  if (entry.count >= limit) {
    return false
  }
  
  entry.count++
  return true
}

export function middleware(request: NextRequest) {
  // Cloudflare Workers経由のアクセスチェック（開発環境以外）
  // development以外では認証チェックを行う（本番でも必要なので）
  const shouldCheckAuth = process.env.VERCEL_ENV !== 'development' && !request.nextUrl.pathname.startsWith('/api/')
  
  // TEMPORARY: Completely disable auth check to confirm this is the issue
  if (false) {
    const cfWorkerKey = request.headers.get('X-Worker-Auth')
    const expectedKey = process.env.WORKER_AUTH_KEY
    const host = request.headers.get('host')
    
    // デバッグ: 認証状況をログ出力
    console.log('Middleware auth check:', {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      shouldCheckAuth,
      path: request.nextUrl.pathname,
      host: host,
      hasAuthKey: !!cfWorkerKey,
      expectedKeySet: !!expectedKey,
      authMatch: cfWorkerKey === expectedKey,
      authKeyPreview: cfWorkerKey ? cfWorkerKey.substring(0, 8) + '...' : 'none',
      expectedKeyPreview: expectedKey ? expectedKey.substring(0, 8) + '...' : 'none'
    })
    
    // Workersからの認証がない場合はカスタムドメインにリダイレクト
    if (!cfWorkerKey || !expectedKey || cfWorkerKey !== expectedKey) {
      // Vercel URLへの直接アクセスをブロック（プリフライトリクエストは除外）
      if (host?.includes('vercel.app') && request.method !== 'OPTIONS') {
        console.log('Redirecting to custom domain:', request.nextUrl.pathname)
        return NextResponse.redirect('https://nico-rank.com' + request.nextUrl.pathname)
      }
    }
  }
  
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             'unknown'

  // APIエンドポイントのレート制限
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // デバッグエンドポイントを本番環境で無効化
    if (process.env.VERCEL_ENV === 'production' && 
        (request.nextUrl.pathname.startsWith('/api/debug') || 
         request.nextUrl.pathname.startsWith('/api/test'))) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }
    
    // レート制限チェック
    const limit = request.nextUrl.pathname.startsWith('/api/admin') ? 5 : 10
    const windowMs = request.nextUrl.pathname.startsWith('/api/admin') ? 60000 : 10000
    
    if (!checkRateLimit(ip, limit, windowMs)) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { 
          status: 429,
          headers: {
            'Retry-After': '10',
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': '0'
          }
        }
      )
    }
  }
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
      
      // 環境変数が設定されていない場合はエラー
      if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
        console.error('ADMIN_USERNAME or ADMIN_PASSWORD environment variables are not set')
        return new NextResponse('Server configuration error', { status: 500 })
      }
      
      const validUsername = process.env.ADMIN_USERNAME
      const validPassword = process.env.ADMIN_PASSWORD
      
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
  matcher: [
    '/admin/:path*',
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)'
  ]
}