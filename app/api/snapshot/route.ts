import { NextRequest, NextResponse } from 'next/server'
import { getFromCloudflareKV } from '@/lib/cloudflare-kv'
import { ungzip } from 'pako'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    // Cloudflare KVからデータを取得
    const compressed = await getFromCloudflareKV('RANKING_LATEST')
    
    if (!compressed) {
      return NextResponse.json(
        { error: 'No ranking data available' },
        { status: 404 }
      )
    }
    
    // gzip圧縮されたデータを解凍
    const decompressed = ungzip(new Uint8Array(compressed))
    const decoder = new TextDecoder()
    const jsonStr = decoder.decode(decompressed)
    const data = JSON.parse(jsonStr)
    
    // レスポンスを返す
    const response = NextResponse.json(data)
    response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    response.headers.set('Content-Type', 'application/json')
    
    return response
  } catch (error) {
    console.error('Error fetching snapshot:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ranking data' },
      { status: 500 }
    )
  }
}