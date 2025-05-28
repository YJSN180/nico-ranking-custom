import type { RankingData } from '@/types/ranking'
import Image from 'next/image'
import { kv } from '@vercel/kv'

export const revalidate = 30

async function fetchRankingData(): Promise<RankingData> {
  try {
    // Try direct KV access first
    const data = await kv.get<RankingData>('ranking-data')
    
    if (!data) {
      return []
    }
    
    // Handle both string and object responses from KV
    if (typeof data === 'object' && Array.isArray(data)) {
      return data as RankingData
    } else if (typeof data === 'string') {
      const parsed = JSON.parse(data)
      return parsed
    }
    
    return []
  } catch (kvError) {
    // Fallback to API fetch
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'
    
    const url = `${baseUrl}/api/ranking`
      
    const response = await fetch(url, {
      next: { revalidate: 30 },
    })
    
    if (!response.ok) {
      return []
    }

    const data = await response.json()
    return data
  }
}

function RankingItem({ item }: { item: RankingData[number] }) {
  return (
    <li style={{ marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '15px' }}>
      <div style={{ display: 'flex', gap: '15px' }}>
        <div style={{ 
          fontSize: '20px', 
          fontWeight: 'bold', 
          minWidth: '50px',
          color: item.rank <= 3 ? '#ff6b6b' : '#333'
        }}>
          {item.rank}位
        </div>
        {item.thumbURL && (
          <Image
            src={item.thumbURL}
            alt={item.title}
            width={100}
            height={56}
            style={{ 
              objectFit: 'cover',
              borderRadius: '4px'
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
              ':hover': { textDecoration: 'underline' }
            }}
          >
            {item.title}
          </a>
          <div style={{ color: '#666', fontSize: '14px', marginTop: '5px' }}>
            {item.views.toLocaleString()} 回再生
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
      <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ color: '#333', marginBottom: '30px' }}>ニコニコ24時間総合ランキング</h1>
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