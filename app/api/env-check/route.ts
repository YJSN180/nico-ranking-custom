import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  return NextResponse.json({
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      WORKER_AUTH_KEY: process.env.WORKER_AUTH_KEY ? 'SET' : 'NOT SET',
      hasWorkerAuthKey: !!process.env.WORKER_AUTH_KEY,
      workerAuthKeyLength: process.env.WORKER_AUTH_KEY?.length || 0,
      // プレビューを完全に削除 - セキュリティリスク
    },
    headers: {
      'x-worker-auth': request.headers.get('x-worker-auth'),
      'host': request.headers.get('host'),
      'user-agent': request.headers.get('user-agent'),
      'x-forwarded-for': request.headers.get('x-forwarded-for'),
      'x-vercel-id': request.headers.get('x-vercel-id')
    },
    middleware: {
      shouldCheckAuth: (process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview'),
      envCheck: {
        isProduction: process.env.VERCEL_ENV === 'production',
        isPreview: process.env.VERCEL_ENV === 'preview',
        isDevelopment: process.env.VERCEL_ENV === 'development'
      }
    },
    timestamp: new Date().toISOString()
  })
}