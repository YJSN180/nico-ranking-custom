import type { RankingData } from '@/types/ranking'
import { kv } from '@vercel/kv'
import ClientPage from './client-page'
// import { getMockRankingData } from '@/lib/mock-data' // モックデータは使用しない
import { scrapeRankingPage, fetchPopularTags } from '@/lib/scraper'
import { filterRankingData } from '@/lib/ng-filter'

// ISRを使用してFunction Invocationsを削減
export const revalidate = 300 // 5分間キャッシュ（30秒から延長）
// dynamicを削除してISRを有効化

interface PageProps {
  searchParams: { [key: string]: string | string[] | undefined }
}

const ITEMS_PER_PAGE = 100 // 1ページあたりの表示件数
const MAX_ITEMS = 300 // 最大取得件数

async function fetchRankingData(genre: string = 'all', period: string = '24h', tag?: string): Promise<{
  items: RankingData
  popularTags?: string[]
}> {
  
  // 1. Primary: Check cache for pre-generated data
  try {
    let cacheKey = `ranking-${genre}-${period}`
    if (tag) {
      cacheKey = `ranking-${genre}-${period}-tag-${encodeURIComponent(tag)}`
    }
    
    const cachedData = await kv.get(cacheKey)
    
    if (cachedData) {
      let result: { items: RankingData, popularTags?: string[] }
      
      if (tag && Array.isArray(cachedData)) {
        // タグフィルタリング済みデータ
        result = { items: cachedData as RankingData, popularTags: [] }
      } else if (typeof cachedData === 'object' && 'items' in cachedData) {
        // ジャンル別データ（itemsとpopularTagsを含む）
        result = cachedData as { items: RankingData, popularTags?: string[] }
      } else {
        result = { items: [], popularTags: [] }
      }
      
      // NGフィルタリングを適用
      const filteredData = await filterRankingData(result)
      return filteredData
    }
  } catch (kvError) {
    // KVエラーログはスキップ（ESLintエラー回避）
  }

  // 2. Fallback: Generate data on demand
  try {
    const { items: scrapedItems } = await scrapeRankingPage(genre, period as '24h' | 'hour', tag, MAX_ITEMS)
    
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
      await kv.set(`ranking-${genre}-${period}`, { items, popularTags }, { ex: 1800 }) // 30分キャッシュ
    }
    
    // NGフィルタリングを適用
    const filteredData = await filterRankingData({ items, popularTags })
    return filteredData
  } catch (error) {
    // スクレイピングエラーログはスキップ（ESLintエラー回避）
    
    // 3. エラー時は空のデータを返す（モックデータは使用しない）
    return { items: [], popularTags: [] }
  }
}

export default async function Home({ searchParams }: PageProps) {
  const genre = (searchParams.genre as string) || 'all'
  const period = (searchParams.period as string) || '24h'
  const tag = searchParams.tag as string | undefined
  const currentPage = Number(searchParams.page) || 1
  
  try {
    
    const { items: allRankingData, popularTags } = await fetchRankingData(genre, period, tag)
    
    // ページネーション処理
    const totalItems = allRankingData.length
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    const rankingData = allRankingData.slice(startIndex, endIndex)

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
            initialPeriod={period}
            initialTag={tag}
            popularTags={popularTags}
            currentPage={currentPage}
            totalItems={totalItems}
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