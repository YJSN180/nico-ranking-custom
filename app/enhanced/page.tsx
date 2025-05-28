import { kv } from '@vercel/kv'
import { RankingCard } from '@/components/RankingCard'
import { RankingTypeSelector } from '@/components/RankingTypeSelector'
import { fetchEnhancedRanking } from '@/lib/fetch-enhanced-rss'
import { EnhancedRankingData } from '@/types/enhanced-ranking'

export const dynamic = 'force-dynamic'
export const revalidate = 30

async function fetchRankingData(): Promise<EnhancedRankingData> {
  try {
    // Try to get from KV first
    const cached = await kv.get('enhanced-ranking-daily-all')
    if (cached) {
      if (typeof cached === 'string') {
        return JSON.parse(cached)
      }
      return cached as EnhancedRankingData
    }
  } catch (error) {
    // Fall through to fetch
  }

  // Fetch fresh data
  try {
    const data = await fetchEnhancedRanking()
    
    // Cache in KV
    await kv.set('enhanced-ranking-daily-all', data, {
      ex: 3600 // 1 hour TTL
    })
    
    return data
  } catch (error) {
    return []
  }
}

export default async function EnhancedHome() {
  const rankingData = await fetchRankingData()

  return (
    <main className="main-container">
      <header className="header">
        <h1 className="title">ニコニコ動画ランキング</h1>
        <RankingTypeSelector currentType="daily-all" />
      </header>

      {rankingData.length === 0 ? (
        <div className="no-data">
          <p>ランキングデータがありません</p>
        </div>
      ) : (
        <div className="ranking-grid responsive-grid">
          {rankingData.map((item) => (
            <RankingCard 
              key={item.id} 
              item={item} 
              isTop3={item.rank <= 3}
            />
          ))}
        </div>
      )}

      <style jsx>{`
        .main-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
          min-height: 100vh;
        }

        .header {
          background: white;
          padding: 24px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          margin-bottom: 24px;
        }

        .title {
          font-size: 32px;
          font-weight: bold;
          color: #333;
          margin: 0 0 16px 0;
          text-align: center;
        }

        .no-data {
          text-align: center;
          padding: 60px 20px;
          color: #666;
          font-size: 18px;
        }

        .ranking-grid {
          display: grid;
          gap: 0;
        }

        .responsive-grid {
          grid-template-columns: 1fr;
        }

        @media (min-width: 768px) {
          .main-container {
            padding: 40px;
          }

          .title {
            font-size: 36px;
          }
        }

        @media (min-width: 1024px) {
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .title {
            text-align: left;
            margin-bottom: 0;
          }
        }
      `}</style>
    </main>
  )
}