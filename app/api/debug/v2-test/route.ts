import { NextResponse } from 'next/server'
import { completeHybridScrapeV2 } from '@/lib/complete-hybrid-scraper-v2'
import { completeHybridScrape } from '@/lib/complete-hybrid-scraper'

export const runtime = 'nodejs'

export async function GET() {
  try {
    // 1. Test HTML meta tag directly
    const htmlResponse = await fetch("https://www.nicovideo.jp/ranking/genre/all?term=24h", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Cookie": "sensitive_material_status=accept"
      }
    })
    
    const html = await htmlResponse.text()
    const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
    
    let htmlSensitiveCount = 0
    let htmlHasStaticElec = false
    let htmlHasGundam = false
    
    if (metaMatch) {
      const encodedData = metaMatch[1] || ''
      const decodedData = encodedData.replace(/&quot;/g, '"').replace(/&amp;/g, "&")
      const jsonData = JSON.parse(decodedData)
      const items = jsonData?.data?.response?.$getTeibanRanking?.data?.items || []
      
      htmlSensitiveCount = items.filter((item: any) => item.requireSensitiveMasking === true).length
      htmlHasStaticElec = items.some((item: any) => item.title?.includes("静電気"))
      htmlHasGundam = items.some((item: any) => item.title?.includes("Gundam"))
    }
    
    // 2. Test V2 implementation
    let v2Result = null
    let v2Error = null
    try {
      v2Result = await completeHybridScrapeV2("all", "24h")
    } catch (error: any) {
      v2Error = error.message
    }
    
    // 3. Test V1 implementation
    let v1Result = null
    let v1Error = null
    try {
      v1Result = await completeHybridScrape("all", "24h")
    } catch (error: any) {
      v1Error = error.message
    }
    
    // 4. Check environment
    const environment = {
      node_env: process.env.NODE_ENV,
      vercel: process.env.VERCEL,
      vercel_env: process.env.VERCEL_ENV,
      vercel_url: process.env.VERCEL_URL,
      runtime: (global as any).Deno ? 'edge' : 'nodejs'
    }
    
    const result = {
      timestamp: new Date().toISOString(),
      environment,
      htmlData: {
        sensitiveCount: htmlSensitiveCount,
        hasStaticElec: htmlHasStaticElec,
        hasGundam: htmlHasGundam
      },
      v2Implementation: {
        success: !v2Error,
        error: v2Error,
        itemCount: v2Result?.items.length || 0,
        hasStaticElec: v2Result?.items.some(item => item.title?.includes("静電気")) || false,
        hasGundam: v2Result?.items.some(item => item.title?.includes("Gundam")) || false,
        sensitiveCount: v2Result?.items.filter((item: any) => item.requireSensitiveMasking === true).length || 0
      },
      v1Implementation: {
        success: !v1Error,
        error: v1Error,
        itemCount: v1Result?.items.length || 0,
        hasStaticElec: v1Result?.items.some(item => item.title?.includes("静電気")) || false,
        hasGundam: v1Result?.items.some(item => item.title?.includes("Gundam")) || false
      }
    }
    
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}