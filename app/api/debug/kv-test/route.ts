import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    // Get environment variables
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN

    // Return debug info
    const debugInfo = {
      hasAccountId: !!CF_ACCOUNT_ID,
      hasNamespaceId: !!CF_NAMESPACE_ID,
      hasApiToken: !!CF_API_TOKEN,
      accountIdLength: CF_ACCOUNT_ID?.length || 0,
      namespaceIdLength: CF_NAMESPACE_ID?.length || 0,
      apiTokenLength: CF_API_TOKEN?.length || 0,
      // Show first/last 4 chars of namespace ID for verification
      namespaceIdPreview: CF_NAMESPACE_ID ? 
        `${CF_NAMESPACE_ID.substring(0, 4)}...${CF_NAMESPACE_ID.substring(CF_NAMESPACE_ID.length - 4)}` : 
        'undefined'
    }

    // Try to fetch from KV if all vars are present
    let kvTestResult = null
    if (CF_ACCOUNT_ID && CF_NAMESPACE_ID && CF_API_TOKEN) {
      const kvUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/VIDEO_STATS_LATEST`
      
      try {
        const kvResponse = await fetch(kvUrl, {
          headers: {
            'Authorization': `Bearer ${CF_API_TOKEN}`,
          }
        })

        kvTestResult = {
          status: kvResponse.status,
          statusText: kvResponse.statusText,
          ok: kvResponse.ok,
          headers: {
            'content-type': kvResponse.headers.get('content-type'),
            'cf-ray': kvResponse.headers.get('cf-ray')
          }
        }

        if (!kvResponse.ok) {
          const errorText = await kvResponse.text()
          kvTestResult.error = errorText.substring(0, 200) // First 200 chars
        } else {
          const data = await kvResponse.json()
          kvTestResult.dataPreview = {
            hasStats: !!data.stats,
            statsCount: data.stats ? Object.keys(data.stats).length : 0,
            metadata: data.metadata
          }
        }
      } catch (error) {
        kvTestResult = {
          error: error.message,
          type: error.constructor.name
        }
      }
    }

    return NextResponse.json({
      environment: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      debugInfo,
      kvTestResult,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({
      error: error.message,
      type: error.constructor.name
    }, { status: 500 })
  }
}