import { NextResponse } from 'next/server'
import { kv } from '@/lib/simple-kv'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    // Check auth
    const authHeader = request.headers.get('authorization')
    const expectedAuth = `Bearer ${process.env.ADMIN_PASSWORD || 'admin'}`
    
    if (authHeader !== expectedAuth) {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    
    // Get KV stats (estimate based on rate limit keys)
    const stats = {
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || 'development',
      kvConfigured: !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_KV_NAMESPACE_ID && process.env.CLOUDFLARE_KV_API_TOKEN),
      estimatedRateLimitKeys: 'N/A', // Can't list keys without additional KV API
      recentErrors: [] as string[],
      recommendations: [] as string[]
    }
    
    // Add recommendations
    if (stats.kvConfigured) {
      stats.recommendations.push('Consider using Cloudflare Workers for rate limiting to reduce KV load')
      stats.recommendations.push('Monitor 429 errors in Vercel Function logs')
      stats.recommendations.push('Memory-based rate limiting is active with 5-second sync intervals')
    }
    
    return NextResponse.json(stats)
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to get KV usage stats',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}