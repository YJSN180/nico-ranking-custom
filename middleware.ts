import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SecurityLogger, SecurityEventType } from './lib/security-logger'
import { getCacheHeaders, CACHE_DURATIONS } from './lib/cache-durations'

// Rate limiting completely removed - relying on Cloudflare's built-in protection

export async function middleware(request: NextRequest) {
  // Cloudflare Workers経由のアクセスチェック（開発環境以外）
  // development以外では認証チェックを行う
  const shouldCheckAuth = process.env.VERCEL_ENV !== 'development'
  
  // Check auth for Cloudflare Workers
  if (shouldCheckAuth) {
    const cfWorkerKey = request.headers.get('X-Worker-Auth')
    const expectedKey = process.env.WORKER_AUTH_KEY
    const host = request.headers.get('host')
    
    
    // Workersからの認証がない場合の処理
    if (!cfWorkerKey || !expectedKey || cfWorkerKey !== expectedKey) {
      // Vercel URLへの直接アクセスをブロック（プリフライトリクエストは除外）
      // ただし、プレビューデプロイメントは除外
      // 重要: nico-rank.comドメインからのアクセスは許可する（無限ループ防止）
      if (host?.includes('vercel.app') && 
          request.method !== 'OPTIONS' && 
          process.env.VERCEL_ENV !== 'preview' &&
          !request.headers.get('x-forwarded-host')?.includes('nico-rank.com')) {
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
    
    // Rate limiting removed - rely on Cloudflare's DDoS protection
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
  
  // パフォーマンス最適化ヘッダー
  if (request.nextUrl.pathname === '/' || request.nextUrl.pathname === '') {
    // リソースヒントの追加でTTFBを改善 - WOFF2を優先的にプリロード
    response.headers.set('Link', [
      '</fonts/nicomoji-plus-v2.woff2>; rel=preload; as=font; type=font/woff2; crossorigin=anonymous; fetchpriority=high',
      '</fonts/comic-sans-ms-bold.woff2>; rel=preload; as=font; type=font/woff2; crossorigin=anonymous; fetchpriority=high',
      '<https://nicovideo.cdn.nimg.jp>; rel=preconnect',
      '<https://tn.smilevideo.jp>; rel=preconnect',
      '<https://secure-dcdn.cdn.nimg.jp>; rel=preconnect',
    ].join(', '))
  }
  
  // APIルートの最適化
  if (request.nextUrl.pathname.startsWith('/api/ranking')) {
    // 開発環境で動的キャッシュWorkerを使用している場合は、Workerのヘッダーを優先
    const existingCacheControl = response.headers.get('Cache-Control')
    const hasWorkerHeaders = response.headers.get('X-Worker-URL') || response.headers.get('X-Data-Source')
    
    if (!existingCacheControl || !hasWorkerHeaders) {
      // WorkerのヘッダーがなければデフォルトのCache-Controlを設定
      response.headers.set('Cache-Control', getCacheHeaders('ranking'))
      // Cloudflare用のキャッシュヘッダー
      response.headers.set('CDN-Cache-Control', `public, s-maxage=${CACHE_DURATIONS.CDN_CACHE.RANKING}`)
    }
    // WorkerのヘッダーがあればそのままKeep（何もしない）
  }
  
  // メインページのキャッシュ（ISRの代替として）
  if (request.nextUrl.pathname === '/' || request.nextUrl.pathname === '') {
    // Cloudflare CDNで20分間キャッシュ
    response.headers.set('Cache-Control', getCacheHeaders('ranking'))
    response.headers.set('CDN-Cache-Control', `public, s-maxage=${CACHE_DURATIONS.CDN_CACHE.RANKING}`)
  }
  
  // フォントファイルの長期キャッシュ
  if (request.nextUrl.pathname.startsWith('/fonts/')) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=31536000, immutable')
  }
  
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
    '/api/admin/:path*',
    // より厳密なマッチングで不要なリクエストを除外
    '/((?!_next/static|_next/image|favicon.ico|manifest.json).*)'
  ]
}