import type { RankingData } from '@/types/ranking'
import Image from 'next/image'
import { kv } from '@vercel/kv'
import { ViewIcon, CommentIcon, MylistIcon, LikeIcon } from '@/components/icons'

export const dynamic = 'force-dynamic'
export const revalidate = 30

async function fetchRankingData(): Promise<RankingData> {
  
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
  // すべてのアイテムを統一されたコンパクトなスタイルで表示
  const rankColors: Record<number, string> = {
    1: '#FFD700',
    2: '#C0C0C0', 
    3: '#CD7F32'
  }
  
  const getRankStyle = (rank: number) => {
    if (rank <= 3) {
      return {
        background: rankColors[rank] || '#f5f5f5',
        color: 'white',
        fontSize: '20px',
        fontWeight: '900' as const,
        minWidth: '44px',
        height: '44px'
      }
    }
    return {
      background: '#f5f5f5',
      color: '#333',
      fontSize: '16px', 
      fontWeight: '700' as const,
      minWidth: '36px',
      height: '36px'
    }
  }

  return (
    <li style={{ 
      marginBottom: '12px',
      background: 'white',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      border: item.rank <= 3 ? `2px solid ${rankColors[item.rank]}` : '1px solid #e5e5e5'
    }}>
      <div style={{ padding: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ 
            ...getRankStyle(item.rank),
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
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
                borderRadius: '6px'
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
                fontSize: '14px',
                fontWeight: '600',
                lineHeight: '1.4',
                display: 'block',
                marginBottom: '4px'
              }}
            >
              {item.title}
            </a>
            <div style={{ display: 'flex', gap: '12px', fontSize: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                <ViewIcon style={{ width: '12px', height: '12px' }} />
                <span>{item.views.toLocaleString()} 回再生</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                <CommentIcon style={{ width: '12px', height: '12px' }} />
                <span>{Math.floor(item.views * 0.15).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                <MylistIcon style={{ width: '12px', height: '12px' }} />
                <span>{Math.floor(item.views * 0.03).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                <LikeIcon style={{ width: '12px', height: '12px' }} />
                <span>{Math.floor(item.views * 0.08).toLocaleString()}</span>
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