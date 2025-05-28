import type { RankingData } from '@/types/ranking'
import Image from 'next/image'
import { kv } from '@vercel/kv'

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

function RankingItem({ item }: { item: RankingData[number] }) {
  const isTop3 = item.rank <= 3
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'] // Gold, Silver, Bronze
  
  return (
    <li style={{ 
      marginBottom: '20px', 
      padding: '20px',
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      border: isTop3 ? `2px solid ${rankColors[item.rank - 1]}` : '2px solid transparent',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-4px)'
      e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)'
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
    }}
    >
      <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
        <div style={{ 
          fontSize: '24px', 
          fontWeight: '800', 
          minWidth: '60px',
          height: '60px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isTop3 ? rankColors[item.rank - 1] : '#f8f9fa',
          color: isTop3 ? 'white' : '#495057',
          boxShadow: isTop3 ? '0 3px 10px rgba(0,0,0,0.2)' : 'none',
        }}>
          {item.rank}
        </div>
        {item.thumbURL && (
          <Image
            src={item.thumbURL}
            alt={item.title}
            width={120}
            height={68}
            style={{ 
              objectFit: 'cover',
              borderRadius: '8px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
            }}
          />
        )}
        <div style={{ flex: 1 }}>
          <a
            href={`https://www.nicovideo.jp/watch/${item.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ 
              color: '#0066cc', 
              textDecoration: 'none',
              fontSize: '16px',
              fontWeight: '600',
              lineHeight: '1.4',
              display: 'block',
              marginBottom: '8px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
          >
            {item.title}
          </a>
          <div style={{ 
            display: 'flex', 
            gap: '20px',
            flexWrap: 'wrap',
            marginTop: '10px'
          }}>
            <div style={{ color: '#666', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span>👁️</span>
              <span>{item.views.toLocaleString()} 回再生</span>
            </div>
            {/* Mock additional data */}
            <div style={{ color: '#666', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span>💬</span>
              <span>{Math.floor(Math.random() * 5000 + 100).toLocaleString()}</span>
            </div>
            <div style={{ color: '#666', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span>⭐</span>
              <span>{Math.floor(Math.random() * 1000 + 50).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}

export default async function Home() {
  try {
    const rankingData = await fetchRankingData()

    if (rankingData.length === 0) {
      return (
        <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ color: '#333', marginBottom: '30px' }}>ニコニコ24時間総合ランキング</h1>
          <p style={{ color: '#666' }}>ランキングデータがありません</p>
        </main>
      )
    }

    return (
      <main style={{ 
        padding: '20px', 
        maxWidth: '1000px', 
        margin: '0 auto',
        backgroundColor: '#f5f5f5',
        minHeight: '100vh'
      }}>
        <header style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '40px 30px',
          borderRadius: '12px',
          marginBottom: '30px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          textAlign: 'center'
        }}>
          <h1 style={{ 
            fontSize: '2.5rem',
            fontWeight: '700',
            margin: 0,
            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)'
          }}>
            ニコニコ24時間総合ランキング
          </h1>
          <p style={{
            fontSize: '1.1rem',
            marginTop: '10px',
            opacity: 0.9
          }}>
            最新のランキング情報をお届けします
          </p>
        </header>
        
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {rankingData.map((item) => (
            <RankingItem key={item.id} item={item} />
          ))}
        </ul>
      </main>
    )
  } catch (error) {
    return (
      <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ color: '#333', marginBottom: '30px' }}>ニコニコ24時間総合ランキング</h1>
        <div style={{ 
          backgroundColor: '#f8f9fa', 
          border: '1px solid #dee2e6', 
          borderRadius: '4px', 
          padding: '20px',
          marginTop: '20px'
        }}>
          <h2 style={{ color: '#495057', fontSize: '18px', marginTop: 0 }}>
            データを準備しています
          </h2>
          <p style={{ color: '#6c757d', marginBottom: '10px' }}>
            ランキングデータは毎日12時に更新されます。
          </p>
          <p style={{ color: '#6c757d', marginBottom: 0 }}>
            初回アクセスの場合、しばらくお待ちください。
          </p>
          {/* Debug info */}
          <details style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
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