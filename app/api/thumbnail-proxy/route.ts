import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

/**
 * サムネイル画像プロキシAPI
 * CORSを回避してニコニコ動画のサムネイルをダウンロード可能にする
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const imageUrl = searchParams.get('url')
    
    if (!imageUrl) {
      return NextResponse.json(
        { error: 'URL parameter is required' },
        { status: 400 }
      )
    }
    
    // URLの検証（ニコニコ動画のCDNからのみ許可）
    const url = new URL(imageUrl)
    const allowedHosts = [
      'nicovideo.cdn.nimg.jp',
      'img.cdn.nimg.jp',
      'tn.smilevideo.jp',
      'tn-skr1.smilevideo.jp',
      'tn-skr2.smilevideo.jp',
      'tn-skr3.smilevideo.jp',
      'tn-skr4.smilevideo.jp'
    ]
    
    if (!allowedHosts.includes(url.hostname)) {
      return NextResponse.json(
        { error: 'Invalid image URL' },
        { status: 400 }
      )
    }
    
    // 画像を取得
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.nicovideo.jp/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    })
    
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch image' },
        { status: imageResponse.status }
      )
    }
    
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'
    const imageBuffer = await imageResponse.arrayBuffer()
    
    // 画像を返す
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'attachment; filename="thumbnail.jpg"',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'X-Content-Type-Options': 'nosniff'
      }
    })
    
  } catch (error) {
    console.error('Thumbnail proxy error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// OPTIONSリクエストの処理（CORS対応）
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  })
}