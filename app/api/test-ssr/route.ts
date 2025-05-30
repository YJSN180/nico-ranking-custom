import { NextResponse } from 'next/server'
import { scrapeRankingPage } from '@/lib/scraper'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const { items } = await scrapeRankingPage('all', '24h')
    
    // シンプルなHTMLを生成
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SSR Test - Niconico Ranking</title>
</head>
<body>
  <h1>ニコニコ総合ランキング（SSRテスト）</h1>
  <p>Total items: ${items.length}</p>
  <h2>センシティブ動画チェック</h2>
  <ul>
    ${items
      .filter(item => item.title?.includes('静電気') || item.title?.includes('Gundam'))
      .map(item => `<li>Rank ${item.rank}: ${item.title}</li>`)
      .join('\n    ')}
  </ul>
  <h2>Top 10</h2>
  <ol>
    ${items
      .slice(0, 10)
      .map(item => `<li>${item.title} (${item.views} views)</li>`)
      .join('\n    ')}
  </ol>
</body>
</html>`
    
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}