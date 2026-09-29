import { NextRequest, NextResponse } from 'next/server'
import { THUMBNAIL_HOSTS } from '@/lib/thumbnail-hosts'

// リダイレクトは fetch に任せず自前で追い、各ホップの行き先も許可ホストに限る
// （許可ホストのリダイレクトを経由して任意のホストや内部アドレスへ取りに行かない）
const MAX_REDIRECTS = 3
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/** 代理取得してよい URL か（http(s) で、ニコニコのサムネイル CDN のホスト） */
function allowedImageTarget(url: URL): URL | null {
  const host = Array.from(THUMBNAIL_HOSTS).find(allowed => allowed === url.hostname)
  if (!host || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null
  // ホストは入力値を再利用せず、許可一覧の値から組み立てる。
  const target = new URL(`https://${host}`)
  if (url.protocol === 'http:') target.protocol = 'http:'
  target.pathname = url.pathname
  target.search = url.search
  return target
}

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

    // URLの検証（ニコニコ動画のCDNからのみ許可。/api/hd-thumbnail が返す URL と同じ一覧）
    // 解析できない URL も入力の誤りとして 400（500 にしない）
    const url = URL.canParse(imageUrl) ? allowedImageTarget(new URL(imageUrl)) : null

    if (!url) {
      return NextResponse.json(
        { error: 'Invalid image URL' },
        { status: 400 }
      )
    }

    // 画像を取得（リダイレクトは行き先を確かめてから MAX_REDIRECTS 回まで追う）
    let target = url
    let imageResponse: Response
    for (let redirects = 0; ; redirects++) {
      imageResponse = await fetch(target.href, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.nicovideo.jp/',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
        },
        redirect: 'manual'
      })
      if (!REDIRECT_STATUSES.has(imageResponse.status)) break

      await imageResponse.body?.cancel()
      const location = imageResponse.headers.get('location')
      const next = location && URL.canParse(location, target) ? allowedImageTarget(new URL(location, target)) : null
      if (!next || redirects >= MAX_REDIRECTS) {
        return NextResponse.json(
          { error: 'Failed to fetch image' },
          { status: 502 }
        )
      }
      target = next
    }

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
