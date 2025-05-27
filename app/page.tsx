import type { RankingData } from '@/types/ranking'
import Image from 'next/image'

export const revalidate = 30

async function fetchRankingData(): Promise<RankingData> {
  // Use absolute URL for server-side fetch in production
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'
  
  console.log('Homepage fetch - VERCEL_URL:', process.env.VERCEL_URL)
  console.log('Homepage fetch - baseUrl:', baseUrl)
  
  const url = `${baseUrl}/api/ranking`
  console.log('Homepage fetch - Full URL:', url)
    
  const response = await fetch(url, {
    next: { revalidate: 30 },
  })

  console.log('Homepage fetch - Response status:', response.status)
  
  if (!response.ok) {
    console.error('Failed to fetch ranking data:', response.status)
    return []
  }

  const data = await response.json()
  console.log('Homepage fetch - Data length:', data.length)
  
  return data
}

function RankingItem({ item }: { item: RankingData[number] }) {
  return (
    <li style={{ marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '15px' }}>
      <div style={{ display: 'flex', gap: '15px' }}>
        <div style={{ fontSize: '20px', fontWeight: 'bold', minWidth: '50px' }}>
          {item.rank}位
        </div>
        {item.thumbURL && (
          <Image
            src={item.thumbURL}
            alt={item.title}
            width={100}
            height={56}
            style={{ objectFit: 'cover' }}
          />
        )}
        <div style={{ flex: 1 }}>
          <a
            href={`https://www.nicovideo.jp/watch/${item.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#0066cc', textDecoration: 'none' }}
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
          <h1>ニコニコ24時間総合ランキング</h1>
          <p>ランキングデータがありません</p>
        </main>
      )
    }

    return (
      <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        <h1>ニコニコ24時間総合ランキング</h1>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {rankingData.map((item) => (
            <RankingItem key={item.id} item={item} />
          ))}
        </ul>
      </main>
    )
  } catch (error) {
    console.error('Homepage - Error in Home component:', error)
    console.error('Homepage - Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    
    return (
      <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        <h1>ニコニコ24時間総合ランキング</h1>
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
            }, null, 2)}</pre>
          </details>
        </div>
      </main>
    )
  }
}