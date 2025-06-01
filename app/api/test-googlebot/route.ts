import { NextResponse } from 'next/server'
import { fetchRanking } from '@/lib/complete-hybrid-scraper'

export const runtime = 'edge'

export async function GET() {
  try {
    // テスト1: 通常のUAでフェッチ（ジオブロックされるはず）
    const normalResponse = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=24h', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja'
      }
    })
    
    // テスト2: Googlebot UAでフェッチ（成功するはず）
    const googlebotResponse = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=24h', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
        'Cookie': 'sensitive_material_status=accept'
      }
    })
    
    // テスト3: fetchRanking関数を使用
    let rankingData = null
    let popularTagsCount = 0
    let fetchError = null
    
    try {
      const result = await fetchRanking('all', null, '24h')
      rankingData = {
        items: result.items.length,
        popularTags: result.popularTags.length,
        firstItem: result.items[0] ? {
          title: result.items[0].title,
          id: result.items[0].id
        } : null
      }
      popularTagsCount = result.popularTags.length
    } catch (error) {
      fetchError = error instanceof Error ? error.message : String(error)
    }
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      tests: {
        normalUA: {
          status: normalResponse.status,
          statusText: normalResponse.statusText,
          contentLength: normalResponse.headers.get('content-length'),
          isBlocked: normalResponse.status === 403
        },
        googlebotUA: {
          status: googlebotResponse.status,
          statusText: googlebotResponse.statusText,
          contentLength: googlebotResponse.headers.get('content-length'),
          isSuccess: googlebotResponse.status === 200
        },
        fetchRanking: {
          success: !fetchError,
          error: fetchError,
          itemCount: rankingData?.items || 0,
          popularTagsCount: popularTagsCount,
          firstItem: rankingData?.firstItem
        }
      },
      conclusion: {
        googlebotWorking: googlebotResponse.status === 200,
        message: googlebotResponse.status === 200 
          ? 'Googlebot UA successfully bypasses geo-blocking!'
          : 'Googlebot UA did not bypass geo-blocking'
      }
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}