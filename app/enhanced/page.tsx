import { kv } from '@vercel/kv'
import { RankingCard } from '@/components/RankingCard'
import { RankingTypeSelector } from '@/components/RankingTypeSelector'
import { fetchEnhancedRanking } from '@/lib/fetch-enhanced-rss'
import { EnhancedRankingData, RANKING_TYPES } from '@/types/enhanced-ranking'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 30

interface PageProps {
  searchParams: { type?: string }
}

async function fetchRankingData(typeId: string): Promise<EnhancedRankingData> {
  const rankingType = RANKING_TYPES.find(t => t.id === typeId) || RANKING_TYPES[1]!
  const kvKey = `enhanced-ranking-${rankingType.id}`
  
  try {
    // Try to get from KV first
    const cached = await kv.get(kvKey)
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
    const data = await fetchEnhancedRanking(rankingType)
    
    // Cache in KV
    await kv.set(kvKey, data, {
      ex: rankingType!.term === 'hour' ? 3600 : 86400
    })
    
    return data
  } catch (error) {
    return []
  }
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