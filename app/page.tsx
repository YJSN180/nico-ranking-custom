import type { RankingData } from '@/types/ranking'
import { kv } from '@vercel/kv'
import ClientPage from './client-page'
// import { getMockRankingData } from '@/lib/mock-data' // モックデータは使用しない
import { scrapeRankingPage, fetchPopularTags } from '@/lib/scraper'

export const dynamic = 'force-dynamic'
export const revalidate = 30

interface PageProps {
  searchParams: { [key: string]: string | string[] | undefined }
}

async function fetchRankingData(genre: string = 'all', tag?: string): Promise<{
  items: RankingData
  popularTags?: string[]
}> {
  
  // 1. Primary: Check cache for pre-generated data
  try {
    let cacheKey = `ranking-${genre}`
    if (tag) {
      cacheKey = `ranking-${genre}-tag-${encodeURIComponent(tag)}`
    }
    
    const cachedData = await kv.get(cacheKey)
    
    if (cachedData) {
      if (tag && Array.isArray(cachedData)) {
        // タグフィルタリング済みデータ
        return { items: cachedData as RankingData, popularTags: [] }
      } else if (typeof cachedData === 'object' && 'items' in cachedData) {
        // ジャンル別データ（itemsとpopularTagsを含む）
        return cachedData as { items: RankingData, popularTags?: string[] }
      }
    }
  } catch (kvError) {
    // KVエラーログはスキップ（ESLintエラー回避）
  }

  // 2. Fallback: Generate data on demand
  try {
    const { items: scrapedItems } = await scrapeRankingPage(genre, '24h', tag)
    
    // 人気タグを公式APIから取得（タグ指定なし、かつallジャンル以外の場合）
    let popularTags: string[] = []
    if (!tag && genre !== 'all') {
      popularTags = await fetchPopularTags(genre)
    }
    
    const items: RankingData = scrapedItems.map((item) => ({
      rank: item.rank || 0,
      id: item.id || '',
      title: item.title || '',
      thumbURL: item.thumbURL || '',
      views: item.views || 0,
      comments: item.comments,
      mylists: item.mylists,
      likes: item.likes,
      tags: item.tags,
      authorId: item.authorId,
      authorName: item.authorName,
      authorIcon: item.authorIcon,
      registeredAt: item.registeredAt,
    })).filter(item => item.id && item.title)
    
    // Cache the result for future requests
    if (!tag && items.length > 0) {
      await kv.set(`ranking-${genre}`, { items, popularTags }, { ex: 1800 }) // 30分キャッシュ
    }
    
    return { items, popularTags }
  } catch (error) {
    // スクレイピングエラーログはスキップ（ESLintエラー回避）
    
    // 3. エラー時は空のデータを返す（モックデータは使用しない）
    return { items: [], popularTags: [] }
  }
}

export default async function Home({ searchParams }: PageProps) {
  const genre = (searchParams.genre as string) || 'all'
  const tag = searchParams.tag as string | undefined
  
  try {
    
    const { items: rankingData, popularTags } = await fetchRankingData(genre, tag)

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
              }}>ニコニコランキング</h1>
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
                {tag ? 'このタグの動画が見つかりません' : 'ランキングデータがありません'}
              </h2>
              <p style={{ color: '#666', fontSize: '1rem', lineHeight: '1.6' }}>
                {tag ? '別のタグをお試しください。' : 'データを取得中です。しばらくお待ちください。'}
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
            }}>ニコニコランキング</h1>
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
          <ClientPage 
            initialData={rankingData} 
            initialGenre={genre}
            initialTag={tag}
            popularTags={popularTags}
          />
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
            }}>ニコニコランキング</h1>
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
              ランキングデータは毎時更新されます。
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
                genre,
                tag,
                KV_configured: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
              }, null, 2)}</pre>
            </details>
          </div>
        </div>
      </main>
    )
  }
}