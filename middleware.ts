import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SecurityLogger, SecurityEventType } from './lib/security-logger'
import { getCacheHeaders, CACHE_DURATIONS } from './lib/cache-durations'
// Note: Edge Runtime対応のため、直接process.envを使用
// import { config } from './lib/config'

// Rate limiting completely removed - relying on Cloudflare's built-in protection

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const host = request.headers.get('host')
  
  // キャッシュ禁止対象パス
  const noStorePaths = ['/api/ranking']
  
  // SECURITY FIX: /api/admin/* は認証チェックを通す
  // 一般的な公開APIのみ認証をスキップ
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/admin')) {
    return NextResponse.next()
  }
  
  // 開発環境は認証チェックをスキップ
  if (process.env.VERCEL_ENV === 'development') {
    return NextResponse.next()
  }
  
  // 本番環境のWorker認証チェック
  const cfWorkerKey = request.headers.get('X-Worker-Auth')
  const expectedKey = process.env.WORKER_AUTH_KEY
  
  // Workersからの認証チェック
  if (cfWorkerKey && expectedKey && cfWorkerKey === expectedKey) {
    // 管理者ページの場合は、Worker認証があってもBasic認証を要求
    if (pathname.startsWith('/admin')) {
      // Basic認証チェックに進む（NextResponse.next()しない）
    } else {
      // 認証OK（管理者ページ以外）
      return NextResponse.next()
    }
  }
  
  // 緊急修復：リダイレクトロジックを一時的に無効化
  // Vercel URLへの直接アクセスチェックを無効化（無限リダイレクト対策）
  // if (host?.includes('vercel.app') && request.method !== 'OPTIONS' && process.env.VERCEL_ENV !== 'preview') {
  //   const xForwardedHost = request.headers.get('x-forwarded-host')
  //   const workerAuth = request.headers.get('X-Worker-Auth')
  //   
  //   // CloudflareのWorker経由でない場合のみリダイレクト（Worker認証キーがない場合）
  //   if (!workerAuth && (!xForwardedHost || !xForwardedHost.includes('nico-rank.com'))) {
  //     return NextResponse.redirect('https://nico-rank.com' + pathname)
  //   }
  // }
  
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
  
  // 特定パスはここで即返し、ヘッダーを強制上書き
  if (noStorePaths.some(p => pathname.startsWith(p))) {
    const res = NextResponse.next()
    res.headers.set('Cache-Control', 'no-store')
    res.headers.set('CDN-Cache-Control', 'no-store')
    res.headers.set('Vercel-CDN-Cache-Control', 'no-store')
    return res
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
  // API /ranking と ルートHTML は no-store を強制（動的レンダリングと整合）
  // /api/ranking は鮮度優先だが、負荷対策で短いCDNキャッシュを許可（15分）
  if (request.nextUrl.pathname.startsWith('/api/ranking')) {
    const smax = 900
    response.headers.set('Cache-Control', `public, max-age=0, s-maxage=${smax}, stale-while-revalidate=${smax}`)
    response.headers.set('CDN-Cache-Control', `public, s-maxage=${smax}`)
    response.headers.set('Vercel-CDN-Cache-Control', `public, s-maxage=${smax}`)
  }

  // HTML は依然 no-store（dplずれ防止）
  if (request.nextUrl.pathname === '/' || request.nextUrl.pathname === '') {
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('CDN-Cache-Control', 'no-store')
    response.headers.set('Vercel-CDN-Cache-Control', 'no-store')
  }
  
  // 静的アセットの長期キャッシュ設定
  if (request.nextUrl.pathname.startsWith('/fonts/')) {
    // フォントファイル: 1年キャッシュ + immutable
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=31536000, immutable')
  } else if (request.nextUrl.pathname.match(/\.(png|jpg|jpeg|gif|webp|avif|svg|ico)$/)) {
    // 画像ファイル: 24時間キャッシュ（更新可能性を考慮）
    response.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400')
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=86400')
  } else if (request.nextUrl.pathname.match(/\.css$/)) {
    // CSSファイル: 正確なMIME type設定 + 24時間キャッシュ + ETag活用
    response.headers.set('Content-Type', 'text/css; charset=utf-8')
    response.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400')
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=86400, must-revalidate')
  } else if (request.nextUrl.pathname.match(/\.js$/)) {
    // JSファイル: 正確なMIME type設定 + 24時間キャッシュ + ETag活用
    response.headers.set('Content-Type', 'application/javascript; charset=utf-8')
    response.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400')
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=86400, must-revalidate')
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
    '/((?!_next/static|_next/image|favicon.ico|fonts|icon|og-image.png|manifest.json).*)', // その他のページ
  ]
}
