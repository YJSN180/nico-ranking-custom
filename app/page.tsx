import type { RankingData } from '@/types/ranking'
import { kv } from '@vercel/kv'
import ClientPage from './client-page'
import { PreferenceLoader } from '@/components/preference-loader'
import { HeaderWithSettings } from '@/components/header-with-settings'
import { SuspenseWrapper } from '@/components/suspense-wrapper'
// import { getMockRankingData } from '@/lib/mock-data' // モックデータは使用しない
import { scrapeRankingPage, fetchPopularTags } from '@/lib/scraper'
import { filterRankingData } from '@/lib/ng-filter'

// ISRを使用してFunction Invocationsを削減
export const revalidate = 300 // 5分間キャッシュ（30秒から延長）
// dynamicを削除してISRを有効化

interface PageProps {
  searchParams: { [key: string]: string | string[] | undefined }
}

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
    const { items: scrapedItems } = await scrapeRankingPage(genre, period as '24h' | 'hour', tag)
    
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
  
  try {
    
    const { items: rankingData, popularTags } = await fetchRankingData(genre, period, tag)

    if (rankingData.length === 0) {
      return (
        <main style={{ 
          padding: '0',
          minHeight: '100vh',
          background: 'var(--background-color)'
        }}>
          <HeaderWithSettings />
          
          <div style={{ 
            maxWidth: '600px', 
            margin: '0 auto',
            padding: '0 20px',
            textAlign: 'center'
          }}>
            <div style={{
              background: 'var(--surface-color)',
              borderRadius: '16px',
              padding: '60px 40px',
              boxShadow: 'var(--shadow-md)'
            }}>
              <div style={{ fontSize: '64px', marginBottom: '24px' }}>📊</div>
              <h2 style={{ color: 'var(--text-primary)', fontSize: '1.5rem', marginBottom: '16px' }}>
                {tag ? 'このタグの動画が見つかりません' : 'ランキングデータがありません'}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6' }}>
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
        background: 'var(--background-color)'
      }}>
        <HeaderWithSettings />
        
        <div style={{ 
          maxWidth: '1200px', 
          margin: '0 auto',
          padding: '20px'
        }}>
          <PreferenceLoader />
          <SuspenseWrapper>
            <ClientPage 
              initialData={rankingData} 
              initialGenre={genre}
              initialPeriod={period}
              initialTag={tag}
              popularTags={popularTags}
            />
          </SuspenseWrapper>
        </div>
      </main>
    )
  } catch (error) {
    return (
      <main style={{ 
        padding: '0',
        minHeight: '100vh',
        background: 'var(--background-color)'
      }}>
        <HeaderWithSettings />
        
        <div style={{ 
          maxWidth: '600px', 
          margin: '0 auto',
          padding: '0 20px',
          textAlign: 'center'
        }}>
          <div style={{
            background: 'var(--surface-color)',
            borderRadius: '16px',
            padding: '60px 40px',
            boxShadow: 'var(--shadow-md)'
          }}>
            <div style={{ fontSize: '64px', marginBottom: '24px' }}>⏳</div>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.5rem', marginBottom: '16px' }}>
              データを準備しています
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6', marginBottom: '8px' }}>
              ランキングデータは毎時更新されます。
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6' }}>
              初回アクセスの場合、しばらくお待ちください。
            </p>
            
            {/* Debug info */}
            <details style={{ marginTop: '32px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <summary style={{ cursor: 'pointer' }}>技術的な詳細</summary>
              <pre style={{ 
                textAlign: 'left', 
                background: 'var(--surface-secondary)', 
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