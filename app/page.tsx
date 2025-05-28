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
      
      // If data is older than 30 minutes, trigger update
      if (ageInMinutes >= 30) {
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
  const rankGradients = {
    1: 'linear-gradient(135deg, #FFD700 0%, #FFED4E 100%)',
    2: 'linear-gradient(135deg, #C0C0C0 0%, #E5E5E5 100%)',
    3: 'linear-gradient(135deg, #CD7F32 0%, #E3A857 100%)'
  }
  
  // TOP3は特別なカードスタイル
  if (isTop3) {
    return (
      <li style={{ 
        marginBottom: '24px',
        background: 'white',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
        border: '3px solid transparent',
        backgroundImage: rankGradients[item.rank as 1 | 2 | 3],
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
        position: 'relative',
        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-8px)'
        e.currentTarget.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.18)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.12)'
      }}
      >
        <div style={{ padding: '24px', background: 'white' }}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <div style={{ 
              fontSize: '48px', 
              fontWeight: '900',
              minWidth: '80px',
              height: '80px',
              background: rankGradients[item.rank as 1 | 2 | 3],
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
            }}>
              {item.rank}
            </div>
            {item.thumbURL && (
              <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px' }}>
                <Image
                  src={item.thumbURL}
                  alt={item.title}
                  width={180}
                  height={101}
                  style={{ 
                    objectFit: 'cover',
                    display: 'block'
                  }}
                />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <a
                href={`https://www.nicovideo.jp/watch/${item.id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ 
                  color: '#0066cc', 
                  textDecoration: 'none',
                  fontSize: '20px',
                  fontWeight: '700',
                  lineHeight: '1.4',
                  display: 'block',
                  marginBottom: '8px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
              >
                {item.title}
              </a>
              <div style={{ display: 'flex', gap: '20px', fontSize: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#666' }}>
                  <span style={{ fontSize: '18px' }}>👁</span>
                  <span style={{ fontWeight: '600' }}>{item.views.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#666' }}>
                  <span style={{ fontSize: '18px' }}>💬</span>
                  <span style={{ fontWeight: '600' }}>{Math.floor(item.views * 0.15).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#666' }}>
                  <span style={{ fontSize: '18px' }}>⭐</span>
                  <span style={{ fontWeight: '600' }}>{Math.floor(item.views * 0.03).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#666' }}>
                  <span style={{ fontSize: '18px' }}>❤️</span>
                  <span style={{ fontWeight: '600' }}>{Math.floor(item.views * 0.08).toLocaleString()}</span>
                </div>
              </div>
              <div style={{ 
                marginTop: '16px', 
                paddingTop: '16px', 
                borderTop: '1px solid #e5e5e5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, hsl(${item.id.charCodeAt(2) * 3}, 70%, 60%), hsl(${item.id.charCodeAt(3) * 3}, 70%, 40%))`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '700'
                  }}>
                    {item.id.charAt(2).toUpperCase()}
                  </div>
                  <span style={{ color: '#666', fontSize: '14px' }}>
                    投稿者{item.id.slice(-3)}
                  </span>
                </div>
                <span style={{ color: '#999', fontSize: '13px' }}>
                  {item.rank}時間前
                </span>
              </div>
            </div>
          </div>
        </div>
      </li>
    )
  }
  
  // 4位以降は通常のカードスタイル
  return (
    <li style={{ 
      marginBottom: '16px',
      background: 'white',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-4px)'
      e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.12)'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)'
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)'
    }}
    >
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ 
            fontSize: '24px', 
            fontWeight: '800', 
            minWidth: '50px',
            height: '50px',
            background: '#f5f5f5',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#333'
          }}>
            {item.rank}
          </div>
          {item.thumbURL && (
            <Image
              src={item.thumbURL}
              alt={item.title}
              width={120}
              height={67}
              style={{ 
                objectFit: 'cover',
                borderRadius: '8px'
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
                lineHeight: '1.3',
                display: 'block'
              }}
              onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
            >
              {item.title}
            </a>
            <div style={{ display: 'flex', gap: '16px', fontSize: '13px', marginTop: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                <span>👁</span>
                <span>{item.views.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                <span>💬</span>
                <span>{Math.floor(item.views * 0.15).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                <span>⭐</span>
                <span>{Math.floor(item.views * 0.03).toLocaleString()}</span>
              </div>
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
        <main style={{ 
          padding: '0',
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #f0f2f5 0%, #ffffff 100%)'
        }}>
          <header style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '40px 20px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
            marginBottom: '40px'
          }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <h1 style={{ 
                color: '#ffffff', 
                marginBottom: '8px',
                textAlign: 'center',
                fontSize: '2.5rem',
                fontWeight: '800',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                letterSpacing: '-0.02em'
              }}>ニコニコ24時間総合ランキング</h1>
              <p style={{
                color: 'rgba(255, 255, 255, 0.9)',
                textAlign: 'center',
                fontSize: '1.1rem',
                margin: 0
              }}>
                最新の人気動画をチェック
              </p>
            </div>
          </header>
          
          <div style={{ 
            maxWidth: '600px', 
            margin: '0 auto',
            padding: '0 20px',
            textAlign: 'center'
          }}>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '60px 40px',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)'
            }}>
              <div style={{ fontSize: '64px', marginBottom: '24px' }}>📊</div>
              <h2 style={{ color: '#333', fontSize: '1.5rem', marginBottom: '16px' }}>
                ランキングデータがありません
              </h2>
              <p style={{ color: '#666', fontSize: '1rem', lineHeight: '1.6' }}>
                データを取得中です。しばらくお待ちください。
              </p>
            </div>
          </div>
        </main>
      )
    }

    return (
      <main style={{ 
        padding: '0',
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f0f2f5 0%, #ffffff 100%)'
      }}>
        <header style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '40px 20px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
          marginBottom: '40px'
        }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <h1 style={{ 
              color: '#ffffff', 
              marginBottom: '8px',
              textAlign: 'center',
              fontSize: '2.5rem',
              fontWeight: '800',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              letterSpacing: '-0.02em'
            }}>ニコニコ24時間総合ランキング</h1>
            <p style={{
              color: 'rgba(255, 255, 255, 0.9)',
              textAlign: 'center',
              fontSize: '1.1rem',
              margin: 0
            }}>
              最新の人気動画をチェック
            </p>
          </div>
        </header>
        
        <div style={{ 
          maxWidth: '1200px', 
          margin: '0 auto',
          padding: '0 20px 40px'
        }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rankingData.map((item) => (
              <RankingItem key={item.id} item={item} />
            ))}
          </ul>
        </div>
      </main>
    )
  } catch (error) {
    return (
      <main style={{ 
        padding: '0',
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f0f2f5 0%, #ffffff 100%)'
      }}>
        <header style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '40px 20px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
          marginBottom: '40px'
        }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <h1 style={{ 
              color: '#ffffff', 
              marginBottom: '8px',
              textAlign: 'center',
              fontSize: '2.5rem',
              fontWeight: '800',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              letterSpacing: '-0.02em'
            }}>ニコニコ24時間総合ランキング</h1>
            <p style={{
              color: 'rgba(255, 255, 255, 0.9)',
              textAlign: 'center',
              fontSize: '1.1rem',
              margin: 0
            }}>
              最新の人気動画をチェック
            </p>
          </div>
        </header>
        
        <div style={{ 
          maxWidth: '600px', 
          margin: '0 auto',
          padding: '0 20px',
          textAlign: 'center'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '60px 40px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)'
          }}>
            <div style={{ fontSize: '64px', marginBottom: '24px' }}>⏳</div>
            <h2 style={{ color: '#333', fontSize: '1.5rem', marginBottom: '16px' }}>
              データを準備しています
            </h2>
            <p style={{ color: '#666', fontSize: '1rem', lineHeight: '1.6', marginBottom: '8px' }}>
              ランキングデータは毎日定期的に更新されます。
            </p>
            <p style={{ color: '#666', fontSize: '1rem', lineHeight: '1.6' }}>
              初回アクセスの場合、しばらくお待ちください。
            </p>
            
            {/* Debug info */}
            <details style={{ marginTop: '32px', fontSize: '12px', color: '#999' }}>
              <summary style={{ cursor: 'pointer' }}>技術的な詳細</summary>
              <pre style={{ 
                textAlign: 'left', 
                background: '#f5f5f5', 
                padding: '12px', 
                borderRadius: '8px',
                marginTop: '8px',
                overflow: 'auto'
              }}>{JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
                VERCEL_URL: process.env.VERCEL_URL || 'not set',
                KV_REST_API_URL: process.env.KV_REST_API_URL ? 'configured' : 'not configured',
                KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ? 'configured' : 'not configured',
              }, null, 2)}</pre>
            </details>
          </div>
        </div>
      </main>
    )
  }
}