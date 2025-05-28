import type { RankingData } from '@/types/ranking'
import { kv } from '@vercel/kv'
import { EnhancedRankingCard } from '@/components/EnhancedRankingCard'
import { RankingTypeSelector } from '@/components/RankingTypeSelector'
import { enhanceRankingItemWithMockData } from '@/types/enhanced-ranking'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 30

async function checkAndUpdateIfStale(): Promise<void> {
  try {
    // Check if data needs update
    const lastUpdateInfo = await kv.get('last-update-info') as {
      timestamp: string
      itemCount: number
      source: string
    } | null
    
    if (lastUpdateInfo) {
      const lastUpdate = new Date(lastUpdateInfo.timestamp)
      const ageInMinutes = (Date.now() - lastUpdate.getTime()) / (1000 * 60)
      
      // If data is older than 60 minutes, trigger update
      if (ageInMinutes >= 60) {
        // Fire and forget - don't wait for update to complete
        fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/update-if-stale`)
          .catch(() => {}) // Ignore errors
      }
    }
  } catch (error) {
    // Ignore errors in background update check
  }
}

async function fetchRankingData(): Promise<RankingData> {
  // Check if update is needed (non-blocking)
  checkAndUpdateIfStale()
  
  // 1. Primary: Direct KV access (as per CLAUDE.md architecture)
  try {
    const data = await kv.get('ranking-data')
    
    if (data) {
      // Handle both string and object responses from KV
      if (typeof data === 'object' && Array.isArray(data)) {
        return data as RankingData
      } else if (typeof data === 'string') {
        return JSON.parse(data) as RankingData
      }
    }
  } catch (kvError) {
    // KV failed, fall back to API
  }

  // 2. Fallback: API fetch
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'
  
  const url = `${baseUrl}/api/ranking`
    
  try {
    const response = await fetch(url, {
      next: { revalidate: 30 },
    })
    
    if (!response.ok) {
      return []
    }

    const data = await response.json()
    return data
  } catch (error) {
    return []
  }
}


export default async function Home() {
  try {
    const rankingData = await fetchRankingData()

    if (rankingData.length === 0) {
      return (
        <main className={styles.mainContainer}>
          <header className={styles.header}>
            <h1 className={styles.title}>ニコニコ24時間総合ランキング</h1>
            <p className={styles.subtitle}>最新のランキング情報をお届けします</p>
          </header>
          <div className={styles.noData}>
            <h2 className={styles.noDataTitle}>ランキングデータがありません</h2>
            <p className={styles.noDataMessage}>しばらく時間をおいて再度アクセスしてください</p>
          </div>
        </main>
      )
    }

    // Enhance ranking data with mock metadata
    const enhancedData = rankingData.map(enhanceRankingItemWithMockData)

    return (
      <main className={styles.mainContainer}>
        <header className={styles.header}>
          <h1 className={styles.title}>ニコニコ24時間総合ランキング</h1>
          <p className={styles.subtitle}>最新のランキング情報をお届けします</p>
        </header>
        
        <RankingTypeSelector />
        
        <ul className={styles.rankingGrid}>
          {enhancedData.map((item) => (
            <EnhancedRankingCard key={item.id} item={item} className={styles.rankingCard} />
          ))}
        </ul>
      </main>
    )
  } catch (error) {
    return (
      <main className={styles.mainContainer}>
        <header className={styles.header}>
          <h1 className={styles.title}>ニコニコ24時間総合ランキング</h1>
          <p className={styles.subtitle}>最新のランキング情報をお届けします</p>
        </header>
        <div className={styles.noData}>
          <h2 className={styles.noDataTitle}>データを準備しています</h2>
          <p className={styles.noDataMessage}>
            ランキングデータは毎日12時に更新されます。<br />
            初回アクセスの場合、しばらくお待ちください。
          </p>
          {/* Debug info */}
          <details style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
            <summary>Debug info</summary>
            <pre>{JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              VERCEL_URL: process.env.VERCEL_URL || 'not set',
              KV_REST_API_URL: process.env.KV_REST_API_URL ? 'configured' : 'not configured',
              KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ? 'configured' : 'not configured',
            }, null, 2)}</pre>
          </details>
        </div>
      </main>
    )
  }
}