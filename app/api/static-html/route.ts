import { NextResponse } from 'next/server'
import type { RankingItem } from '@/types/ranking'

async function fetchRankingData(genre: string = 'all', period: string = '24h'): Promise<RankingItem[]> {
  try {
    const params = new URLSearchParams()
    params.set('genre', genre)
    params.set('period', period)
    
    const apiUrl = `https://nico-rank.com/api/ranking?${params.toString()}`
    
    const response = await fetch(apiUrl, {
      next: { revalidate: 600 },
      headers: {
        'Accept': 'application/json',
        'X-Worker-Auth': process.env.WORKER_AUTH_KEY || '',
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const data = await response.json()
    if (data && data.items && Array.isArray(data.items)) {
      return data.items
    }
  } catch (error) {
    console.error('[Static HTML] API error:', error)
  }

  return []
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const genre = searchParams.get('genre') || 'all'
  const period = searchParams.get('period') || '24h'
  const page = parseInt(searchParams.get('page') || '1', 10)

  const rankingData = await fetchRankingData(genre, period)
  
  const ITEMS_PER_PAGE = 100
  const startIndex = (page - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const currentPageItems = rankingData.slice(startIndex, endIndex)

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ニコラン(Re:turn) - 超軽量版</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; }
    .header { background: #333; color: white; padding: 1rem; text-align: center; }
    .container { max-width: 1200px; margin: 0 auto; padding: 1rem; }
    .selector { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .selector a { padding: 0.5rem 1rem; background: white; border-radius: 4px; text-decoration: none; color: #333; }
    .selector a.active { background: #007bff; color: white; }
    .ranking-item { background: white; margin-bottom: 1rem; padding: 1rem; border-radius: 8px; display: grid; grid-template-columns: 60px 120px 1fr; gap: 1rem; align-items: center; position: relative; }
    .rank { font-size: 1.5rem; font-weight: bold; color: #666; text-align: center; }
    .thumb { width: 120px; height: 80px; object-fit: cover; border-radius: 4px; }
    .info h3 { margin-bottom: 0.5rem; font-size: 1rem; }
    .info a { color: #0066cc; text-decoration: none; }
    .info a:hover { text-decoration: underline; }
    .meta { display: flex; gap: 1rem; color: #666; font-size: 0.9rem; }
    .pagination { display: flex; justify-content: center; gap: 1rem; margin-top: 2rem; }
    .pagination a { padding: 0.5rem 1rem; background: white; border-radius: 4px; text-decoration: none; color: #333; }
    @media (max-width: 600px) {
      .ranking-item { grid-template-columns: 1fr; }
      .rank { position: absolute; top: 0.5rem; left: 0.5rem; background: rgba(255,255,255,0.9); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; }
      .thumb { width: 100%; height: auto; }
    }
  </style>
</head>
<body>
  <header class="header">
    <h1>ニコラン(Re:turn) - 超軽量版</h1>
  </header>
  
  <div class="container">
    <nav class="selector">
      <a href="?genre=all" class="${genre === 'all' ? 'active' : ''}">総合</a>
      <a href="?genre=game" class="${genre === 'game' ? 'active' : ''}">ゲーム</a>
      <a href="?genre=anime" class="${genre === 'anime' ? 'active' : ''}">アニメ</a>
      <a href="?genre=music" class="${genre === 'music' ? 'active' : ''}">音楽・サウンド</a>
      <a href="?genre=entertainment" class="${genre === 'entertainment' ? 'active' : ''}">エンタメ</a>
      <a href="?genre=dance" class="${genre === 'dance' ? 'active' : ''}">ダンス</a>
      <a href="?genre=vocaloid" class="${genre === 'vocaloid' ? 'active' : ''}">VOCALOID</a>
    </nav>
    
    <nav class="selector">
      <a href="?genre=${genre}&period=24h" class="${period === '24h' ? 'active' : ''}">24時間</a>
      <a href="?genre=${genre}&period=hour" class="${period === 'hour' ? 'active' : ''}">毎時</a>
    </nav>
    
    <main>
      ${currentPageItems.map((item, index) => `
      <article class="ranking-item">
        <div class="rank">${startIndex + index + 1}</div>
        <img src="${item.thumbURL}" alt="" class="thumb" loading="${index < 3 ? 'eager' : 'lazy'}">
        <div class="info">
          <h3>
            <a href="https://www.nicovideo.jp/watch/${item.id}" target="_blank" rel="noopener noreferrer">
              ${item.title}
            </a>
          </h3>
          <div class="meta">
            <span>${item.views.toLocaleString()} 再生</span>
            <span>${(item.comments || 0).toLocaleString()} コメ</span>
            <span>${(item.mylists || 0).toLocaleString()} マイリス</span>
          </div>
        </div>
      </article>
      `).join('')}
    </main>
    
    <nav class="pagination">
      ${page > 1 ? `<a href="?genre=${genre}&period=${period}&page=${page - 1}">前のページ</a>` : ''}
      <span>ページ ${page}</span>
      ${currentPageItems.length === ITEMS_PER_PAGE ? `<a href="?genre=${genre}&period=${period}&page=${page + 1}">次のページ</a>` : ''}
    </nav>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=600, stale-while-revalidate=1200',
    }
  })
}