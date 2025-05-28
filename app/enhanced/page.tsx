import { kv } from '@vercel/kv'
import { RankingCard } from '@/components/RankingCard'
import { RankingTypeSelector } from '@/components/RankingTypeSelector'
import { EnhancedRankingData, RANKING_TYPES } from '@/types/enhanced-ranking'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 30

interface PageProps {
  searchParams: { type?: string }
}

async function fetchRankingData(typeId: string): Promise<EnhancedRankingData> {
  // For now, use the existing working ranking data from KV
  // This ensures the enhanced page works while we develop the Snapshot API integration
  try {
    // Get existing ranking data that we know works
    const cached = await kv.get('ranking-data')
    if (cached) {
      if (typeof cached === 'string') {
        return JSON.parse(cached)
      }
      return cached as EnhancedRankingData
    }
  } catch (error) {
    // Fall through to API fallback
  }

  // Fallback to API route which has the working logic
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000'
    
    const response = await fetch(`${baseUrl}/api/ranking`, {
      cache: 'no-cache'
    })
    
    if (response.ok) {
      return await response.json()
    }
  } catch (error) {
    // Fall through to empty array
  }

  return []
}

export default async function EnhancedHome({ searchParams }: PageProps) {
  const currentType = searchParams.type || 'daily-all'
  const rankingData = await fetchRankingData(currentType)
  const currentRanking = RANKING_TYPES.find(t => t.id === currentType)

  return (
    <main className={styles.mainContainer}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          ニコニコ動画{currentRanking?.label || ''}ランキング
        </h1>
        <RankingTypeSelector currentType={currentType} />
      </header>

      {rankingData.length === 0 ? (
        <div className={styles.noData}>
          <p>ランキングデータがありません</p>
        </div>
      ) : (
        <div className={styles.rankingGrid}>
          {rankingData.map((item) => (
            <RankingCard 
              key={item.id} 
              item={item} 
              isTop3={item.rank <= 3}
            />
          ))}
        </div>
      )}
    </main>
  )
}