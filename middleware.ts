import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { KVRateLimit } from './lib/rate-limit-kv'
import { SecurityLogger, SecurityEventType } from './lib/security-logger'

// フォールバック用のインメモリレート制限（KVが利用できない場合）
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

async function checkRateLimit(ip: string, limit: number = 10, windowMs: number = 10000): Promise<boolean> {
  try {
    // Try CloudFlare KV first
    const kvResult = await KVRateLimit.checkLimit(ip, limit, windowMs)
    return kvResult
  } catch (error) {
    // Fallback to in-memory rate limiting
    console.error('[RATE_LIMIT] KV failed, using in-memory:', error)
    
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
}

export async function middleware(request: NextRequest) {
  // Cloudflare Workers経由のアクセスチェック（開発環境以外）
  // development以外では認証チェックを行う
  const shouldCheckAuth = process.env.VERCEL_ENV !== 'development'
  
  // Check auth for Cloudflare Workers
  if (shouldCheckAuth) {
    const cfWorkerKey = request.headers.get('X-Worker-Auth')
    const expectedKey = process.env.WORKER_AUTH_KEY
    const host = request.headers.get('host')
    
    
    // Workersからの認証がない場合はカスタムドメインにリダイレクト
    if (!cfWorkerKey || !expectedKey || cfWorkerKey !== expectedKey) {
      // Vercel URLへの直接アクセスをブロック（プリフライトリクエストは除外）
      // ただし、プレビューデプロイメントは除外
      if (host?.includes('vercel.app') && request.method !== 'OPTIONS' && process.env.VERCEL_ENV !== 'preview') {
        return NextResponse.redirect('https://nico-rank.com' + request.nextUrl.pathname)
      }
    }
  }
  
  // プレビューデプロイメントの保護を無効化
  // Vercelのスタンダードプロテクションに依存
  // if (process.env.VERCEL_ENV === 'preview') {
  //   const previewProtectionKey = request.headers.get('X-Preview-Protection')
  //   const expectedPreviewKey = process.env.PREVIEW_PROTECTION_KEY
  //   
  //   // プレビュー保護キーが設定されていて、一致しない場合はアクセスを拒否
  //   if (expectedPreviewKey && previewProtectionKey !== expectedPreviewKey) {
  //     return new NextResponse('Preview deployment requires authentication', {
  //       status: 401,
  //       headers: {
  //         'WWW-Authenticate': 'Basic realm="Preview Deployment"',
  //       },
  //     })
  //   }
  // }
  
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             'unknown'

  // APIエンドポイントのレート制限
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // デバッグエンドポイントを本番環境で無効化
    const dangerousEndpoints = [
      '/api/debug',
      '/api/test',
      '/api/debug-sensitive',
      '/api/internal-proxy',
      '/api/env-check',
      '/api/debug-env',
      '/api/test-scraping',
      '/api/test-hybrid-scrape',
      '/api/test-hourly-scrape',
      '/api/debug-genre'
    ]
    
    if (process.env.VERCEL_ENV === 'production' && 
        dangerousEndpoints.some(path => request.nextUrl.pathname.startsWith(path))) {
      SecurityLogger.log({
        event: SecurityEventType.DEBUG_ENDPOINT_ACCESS,
        ip,
        path: request.nextUrl.pathname,
        userAgent: request.headers.get('user-agent') || undefined
      })
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }
    
    // レート制限チェック（管理画面はさらに厳しく）
    const isAdminPath = request.nextUrl.pathname.startsWith('/api/admin') || request.nextUrl.pathname.startsWith('/admin')
    const limit = isAdminPath ? 3 : 10  // 管理画面は3回/分に制限
    const windowMs = isAdminPath ? 60000 : 10000
    
    if (!(await checkRateLimit(ip, limit, windowMs))) {
      SecurityLogger.logRateLimit(
        ip,
        request.nextUrl.pathname,
        request.headers.get('user-agent') || undefined,
        limit,
        windowMs
      )
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
    const adminAuthCookie = request.cookies.get('admin-auth')
    
    // 通常のページアクセスの場合
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
      const credentials = atob(base64Credentials!)
      const [username, password] = credentials.split(':')
      
      // 環境変数が設定されていない場合はエラー
      if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
        // ADMIN_USERNAME or ADMIN_PASSWORD environment variables are not set
        return new NextResponse('Server configuration error', { status: 500 })
      }
      
      const validUsername = process.env.ADMIN_USERNAME
      const validPassword = process.env.ADMIN_PASSWORD
      
      if (username !== validUsername || password !== validPassword) {
        SecurityLogger.logAuthFailure(
          'admin',
          ip,
          request.nextUrl.pathname,
          request.headers.get('user-agent') || undefined,
          username
        )
        return new NextResponse('Invalid credentials', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="Admin Area"',
          },
        })
      }
      
      // 認証成功時、クッキーを設定
      const response = NextResponse.next()
      response.cookies.set('admin-auth', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24, // 24 hours
        path: '/'
      })
      return response
    } catch {
      return new NextResponse('Invalid authentication format', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Admin Area"',
        },
      })
    }
  }
  
  // API admin routes - check cookie
  if (request.nextUrl.pathname.startsWith('/api/admin')) {
    const adminAuthCookie = request.cookies.get('admin-auth')
    if (adminAuthCookie?.value !== 'authenticated') {
      return new NextResponse('Unauthorized', { status: 401 })
    }
  }
  
  const response = NextResponse.next()
  
  // セキュリティヘッダーを追加
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  
  // 本番環境でのみHSTSを有効化
  if (process.env.VERCEL_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }
  
  return response
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)'
  ]
}