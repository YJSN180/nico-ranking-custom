import type { Metadata } from 'next'
import type { RankingData } from '@/types/ranking'
import ClientPage from './client-page'
import { PreferenceLoader } from '@/components/preference-loader'
import { HeaderWithSettings } from '@/components/header-with-settings'
import { SuspenseWrapper } from '@/components/suspense-wrapper'
import { Footer } from '@/components/footer'
// import { getMockRankingData } from '@/lib/mock-data' // モックデータは使用しない
import { scrapeRankingPage } from '@/lib/scraper'
import { getPopularTags } from '@/lib/popular-tags'
import { filterRankingDataServer } from '@/lib/ng-filter-server'
import { getGenreRanking } from '@/lib/cloudflare-kv'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import { RANKING_GENRES } from '@/types/ranking-config'

// ISRを使用してFunction Invocationsを削減
export const revalidate = 300 // 5分間キャッシュ（30秒から延長）
// dynamicを削除してISRを有効化

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams
  const genre = (params.genre as RankingGenre) || 'all'
  const period = (params.period as RankingPeriod) || '24h'
  const tag = params.tag as string | undefined
  
  const genreInfo = RANKING_GENRES.find(g => g.value === genre)
  const genreName = genreInfo?.label || '総合'
  const periodName = period === '24h' ? '24時間' : '毎時'
  
  let title = `${genreName} ${periodName}ランキング - ニコニコランキング(Re:turn)`
  let description = `ニコニコ動画の${genreName}ジャンル ${periodName}ランキング。`
  
  if (tag) {
    title = `「${tag}」タグ ${genreName} ${periodName}ランキング - ニコニコランキング(Re:turn)`
    description = `ニコニコ動画の「${tag}」タグが付いた${genreName}動画の${periodName}ランキング。`
  }
  
  description += '最新の人気動画をチェック！'
  
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://nico-rank.com${params.genre ? `?genre=${genre}` : ''}${params.period ? `&period=${period}` : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`,
    },
    twitter: {
      title,
      description,
    },
  }
}

async function fetchRankingData(genre: string = 'all', period: string = '24h', tag?: string): Promise<{
  items: RankingData
  popularTags?: string[]
}> {
  
  // 1. Primary: Cloudflare KVから読み取りを試みる
  if (!tag) {
    try {
      const cfData = await getGenreRanking(genre, period as RankingPeriod)
      if (cfData && cfData.items && cfData.items.length > 0) {
        // NGフィルタリングを適用
        // 初期表示は100件だが、全データを保持してhasMoreの判定を正しく行えるようにする
        const filteredData = await filterRankingDataServer({
          items: cfData.items, // 全データを渡す（最大500件）
          popularTags: cfData.popularTags
        })
        return filteredData
      }
    } catch (cfError) {
      // Cloudflare KVエラーは無視してスクレイピングにフォールバック
    }
  }

  // 2. Fallback: Generate data on demand
  try {
    const { items: scrapedItems } = await scrapeRankingPage(genre, period as '24h' | 'hour', tag)
    
    // 人気タグを取得（タグ指定なし、かつallジャンル以外の場合）
    let popularTags: string[] = []
    if (!tag && genre !== 'all') {
      try {
        // popular-tags.tsのgetPopularTagsを使用（KVやバックアップから取得）
        popularTags = await getPopularTags(genre as any, period as '24h' | 'hour')
      } catch (error) {
        // エラー時は空配列のまま
      }
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
    
    // Caching is now handled by Cloudflare KV in the scraper
    
    // NGフィルタリングを適用
    const filteredData = await filterRankingDataServer({ items, popularTags })
    return filteredData
  } catch (error) {
    // スクレイピングエラーログはスキップ（ESLintエラー回避）
    
    // 3. エラー時は空のデータを返す（モックデータは使用しない）
    return { items: [], popularTags: [] }
  }
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams
  const genre = (params.genre as string) || 'all'
  const period = (params.period as string) || '24h'
  const tag = params.tag as string | undefined
  
  try {
    
    const { items: rankingData, popularTags = [] } = await fetchRankingData(genre, period, tag)

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
        <Footer />
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
                CloudflareKV_configured: !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_KV_NAMESPACE_ID && process.env.CLOUDFLARE_KV_API_TOKEN),
              }, null, 2)}</pre>
            </details>
          </div>
        </div>
        <Footer />
      </main>
    )
  }
}