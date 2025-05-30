import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const results: any = {}
    
    // 1. 24時間ランキングのHTML取得
    const response24h = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=24h', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Cookie': 'sensitive_material_status=accept'
      }
    })
    const html24h = await response24h.text()
    
    // 2. 毎時ランキングのHTML取得
    const responseHour = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=hour', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Cookie': 'sensitive_material_status=accept'
      }
    })
    const htmlHour = await responseHour.text()
    
    // 3. meta tagの内容を比較
    const meta24h = html24h.match(/<meta name="server-response" content="([^"]+)"/)
    const metaHour = htmlHour.match(/<meta name="server-response" content="([^"]+)"/)
    
    results['24h'] = {
      htmlLength: html24h.length,
      hasMetaTag: !!meta24h,
      dataVideoIds: (html24h.match(/data-video-id="/g) || []).length
    }
    
    results['hour'] = {
      htmlLength: htmlHour.length,
      hasMetaTag: !!metaHour,
      dataVideoIds: (htmlHour.match(/data-video-id="/g) || []).length
    }
    
    // meta tagの中身を解析
    if (meta24h && metaHour) {
      try {
        const data24h = JSON.parse(meta24h[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
        const dataHour = JSON.parse(metaHour[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
        
        const items24h = data24h?.data?.response?.$getTeibanRanking?.data?.items || []
        const itemsHour = dataHour?.data?.response?.$getTeibanRanking?.data?.items || []
        
        results.metaComparison = {
          '24h_count': items24h.length,
          'hour_count': itemsHour.length,
          '24h_top3': items24h.slice(0, 3).map((item: any) => item.title),
          'hour_top3': itemsHour.slice(0, 3).map((item: any) => item.title),
          'are_same': items24h[0]?.id === itemsHour[0]?.id
        }
      } catch (e) {
        results.metaComparison = { error: 'Failed to parse meta data' }
      }
    }
    
    // 実際のランキングページのURLパターンを確認
    results.urlPatterns = {
      '24h': 'https://www.nicovideo.jp/ranking/genre/all?term=24h',
      'hour': 'https://www.nicovideo.jp/ranking/genre/all?term=hour',
      'note': 'Vercelサーバーからアクセスする際の挙動を確認'
    }
    
    return NextResponse.json(results)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}