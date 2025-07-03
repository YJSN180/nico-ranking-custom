import type { Metadata } from 'next'
import type { RankingItem } from '@/types/ranking'
import { cookies } from 'next/headers'
import { COOKIE_NAME } from '@/lib/user-preferences-cookie'
import { filterRankingDataServer } from '@/lib/ng-filter-server'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import { RANKING_GENRES } from '@/types/ranking-config'
import { notFound } from 'next/navigation'

// Force static generation with ISR
export const dynamic = 'force-static'
export const revalidate = 600 // 10 minutes

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

async function fetchRankingData(genre: string = 'all', period: string = '24h', tag?: string): Promise<{
  items: RankingItem[]
  popularTags?: string[]
}> {
  try {
    const params = new URLSearchParams()
    params.set('genre', genre)
    params.set('period', period)
    if (tag) params.set('tag', tag)
    
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
      const { filteredData } = await filterRankingDataServer(data)
      return filteredData
    }
  } catch (error) {
    console.error('[SSR] API error:', error)
  }

  return { items: [], popularTags: [] }
}

export default async function MinimalHome({ searchParams }: PageProps) {
  const params = await searchParams
  
  const genre = (params.genre as string) || 'all'
  const period = (params.period as string) || '24h'
  const tag = params.tag as string | undefined
  const page = parseInt((params.page as string) || '1', 10)
  
  const { items: rankingData } = await fetchRankingData(genre, period, tag)

  if (rankingData.length === 0) {
    return <div>No data available</div>
  }

  const ITEMS_PER_PAGE = 100
  const startIndex = (page - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const currentPageItems = rankingData.slice(startIndex, endIndex)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
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
        .info h3 { margin-bottom: 0.5rem; }
        .info a { color: #0066cc; text-decoration: none; }
        .info a:hover { text-decoration: underline; }
        .meta { display: flex; gap: 1rem; color: #666; font-size: 0.9rem; }
        .pagination { display: flex; justify-content: center; gap: 1rem; margin-top: 2rem; }
        .pagination a { padding: 0.5rem 1rem; background: white; border-radius: 4px; text-decoration: none; color: #333; }
        @media (max-width: 600px) {
          .ranking-item { grid-template-columns: 1fr; }
          .rank { position: absolute; top: 0.5rem; left: 0.5rem; background: rgba(255,255,255,0.9); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
          .thumb { width: 100%; height: auto; }
        }
      ` }} />
      
      <header className="header">
        <h1>ニコラン(Re:turn)</h1>
      </header>
      
      <div className="container">
        <nav className="selector">
          <a href="?genre=all" className={genre === 'all' ? 'active' : ''}>総合</a>
          <a href="?genre=game" className={genre === 'game' ? 'active' : ''}>ゲーム</a>
          <a href="?genre=anime" className={genre === 'anime' ? 'active' : ''}>アニメ</a>
          <a href="?genre=music" className={genre === 'music' ? 'active' : ''}>音楽・サウンド</a>
          <a href="?genre=entertainment" className={genre === 'entertainment' ? 'active' : ''}>エンタメ</a>
          <a href="?genre=dance" className={genre === 'dance' ? 'active' : ''}>ダンス</a>
          <a href="?genre=vocaloid" className={genre === 'vocaloid' ? 'active' : ''}>VOCALOID</a>
        </nav>
        
        <nav className="selector">
          <a href={`?genre=${genre}&period=24h`} className={period === '24h' ? 'active' : ''}>24時間</a>
          <a href={`?genre=${genre}&period=hour`} className={period === 'hour' ? 'active' : ''}>毎時</a>
        </nav>
        
        <main>
          {currentPageItems.map((item, index) => (
            <article key={item.id} className="ranking-item">
              <div className="rank">{startIndex + index + 1}</div>
              <img 
                src={item.thumbURL} 
                alt="" 
                className="thumb"
                loading={index < 3 ? "eager" : "lazy"}
              />
              <div className="info">
                <h3>
                  <a href={`https://www.nicovideo.jp/watch/${item.id}`} target="_blank" rel="noopener noreferrer">
                    {item.title}
                  </a>
                </h3>
                <div className="meta">
                  <span>{item.views.toLocaleString()} 再生</span>
                  <span>{item.comments?.toLocaleString() || 0} コメ</span>
                  <span>{item.mylists?.toLocaleString() || 0} マイリス</span>
                </div>
              </div>
            </article>
          ))}
        </main>
        
        <nav className="pagination">
          {page > 1 && (
            <a href={`?genre=${genre}&period=${period}${tag ? `&tag=${tag}` : ''}&page=${page - 1}`}>
              前のページ
            </a>
          )}
          <span>ページ {page}</span>
          {currentPageItems.length === ITEMS_PER_PAGE && (
            <a href={`?genre=${genre}&period=${period}${tag ? `&tag=${tag}` : ''}&page=${page + 1}`}>
              次のページ
            </a>
          )}
        </nav>
      </div>
    </>
  )
}

export const metadata: Metadata = {
  title: 'ニコラン(Re:turn) - ニコニコ動画ランキング',
  description: 'ニコニコ動画の人気動画ランキングを快適に閲覧',
}