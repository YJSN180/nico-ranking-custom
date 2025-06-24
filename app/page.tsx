import type { Metadata } from 'next'
import type { RankingData, RankingItem } from '@/types/ranking'
import ClientPage from './client-page'
import { HeaderWithSettings } from '@/components/header-with-settings'
import { SuspenseWrapper } from '@/components/suspense-wrapper'
import { Footer } from '@/components/footer'
import { cookies } from 'next/headers'
import { COOKIE_NAME } from '@/lib/user-preferences-cookie'
import { getPopularTags } from '@/lib/popular-tags'
import { filterRankingDataServer } from '@/lib/ng-filter-server'
// import { getGenreRanking } from '@/lib/cloudflare-kv' // R2移行完了により不要
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import { RANKING_GENRES } from '@/types/ranking-config'
import { notFound } from 'next/navigation'
import { CACHE_DURATIONS } from '@/lib/cache-durations'

// ISRを使用してFunction Invocationsを削減
export const revalidate = 300 // 5分間キャッシュ（TTFB重視）

// 静的生成を無効化（ISRのWrite Units制限のため）
// Vercel Hobbyプランは128 Write Units/月しかないため、
// 動的レンダリングに切り替えてキャッシュヘッダーで対応
// export async function generateStaticParams() {
//   return []
// }

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

// メタデータテンプレートを事前定義して計算コストを削減
const DEFAULT_TITLE = 'ニコラン(Re:turn) - ニコニコ動画のランキングを快適に表示'
const DEFAULT_DESCRIPTION = 'ニコニコ動画の人気動画ランキングを快適に閲覧。毎時・24時間のランキングを各ジャンルごとに表示。話題の動画を見逃さずチェック！'
const OG_IMAGE = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  type: 'image/png' as const,
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams
  const genre = (params.genre as RankingGenre) || 'all'
  const period = (params.period as RankingPeriod) || '24h'
  const tag = params.tag as string | undefined
  
  // デフォルト（総合・24時間・タグなし）の場合は事前定義されたメタデータを使用
  const isDefault = genre === 'all' && period === '24h' && !tag
  
  if (isDefault) {
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      openGraph: {
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        siteName: 'ニコラン(Re:turn)',
        url: 'https://nico-rank.com',
        images: [{ ...OG_IMAGE, alt: DEFAULT_TITLE }],
      },
      twitter: {
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        card: 'summary_large_image',
        images: [{ ...OG_IMAGE, alt: DEFAULT_TITLE }],
      },
    }
  }
  
  // 非デフォルトの場合のみ動的に生成
  const genreInfo = RANKING_GENRES.find(g => g.value === genre)
  const genreName = genreInfo?.label || '総合'
  const periodName = period === '24h' ? '24時間' : '毎時'
  
  let title: string
  let description: string
  
  if (tag) {
    title = `「${tag}」タグ ${genreName} ${periodName}ランキング - ニコラン(Re:turn)`
    description = `ニコニコ動画の「${tag}」タグが付いた${genreName}動画の${periodName}ランキング。最新の人気動画をチェック！`
  } else {
    title = `${genreName} ${periodName}ランキング - ニコラン(Re:turn)`
    description = `ニコニコ動画の${genreName}ジャンル ${periodName}ランキング。最新の人気動画をチェック！`
  }
  
  const url = `https://nico-rank.com${params.genre ? `?genre=${genre}` : ''}${params.period ? `&period=${period}` : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`
  
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'ニコラン(Re:turn)',
      url,
      images: [{ ...OG_IMAGE, alt: title }],
    },
    twitter: {
      title,
      description,
      card: 'summary_large_image',
      images: [{ ...OG_IMAGE, alt: title }],
    },
  }
}

async function fetchRankingDataDirect(genre: string = 'all', period: string = '24h', tag?: string): Promise<{
  items: RankingItem[]
  popularTags?: string[]
}> {
  
  // 直接Cloudflare KVから取得してAPIコールを回避
  try {
    if (tag) {
      // タグ別ランキングの場合
      const { getTagRanking } = await import('@/lib/cloudflare-kv')
      const tagItems = await getTagRanking(genre, period as 'hour' | '24h', tag)
      if (tagItems && tagItems.length > 0) {
        // NGフィルタリングを適用
        const { filteredData } = await filterRankingDataServer({ items: tagItems })
        return filteredData
      }
      return { items: [], popularTags: [] }
    } else {
      // 通常のジャンル別ランキング
      const { getGenreRanking } = await import('@/lib/cloudflare-kv')
      const genreData = await getGenreRanking(genre, period as 'hour' | '24h')
      if (genreData && genreData.items && genreData.items.length > 0) {
        // NGフィルタリングを適用
        const { filteredData } = await filterRankingDataServer({
          items: genreData.items,
          popularTags: genreData.popularTags
        })
        return filteredData
      }
    }
  } catch (error) {
    console.error('[SSR] Direct KV error:', error)
  }

  // エラーの場合は空のデータを返す
  return {
    items: [],
    popularTags: []
  }
}

export default async function Home({ searchParams }: PageProps) {
  const startTime = Date.now()
  
  // 並列でPromiseを解決してTTFBを改善
  const [params, cookieStore] = await Promise.all([
    searchParams,
    cookies()
  ])
  
  const paramsTime = Date.now() - startTime
  
  // URLパラメータが優先、なければCookieから、それもなければデフォルト値
  let genre = params.genre as string
  let period = params.period as string
  let tag = params.tag as string | undefined
  let page = parseInt((params.page as string) || '1', 10)
  
  // Cookieから設定を読み取る（無効なジャンルを除外）
  if (!genre || !period) {
    const preferenceCookie = cookieStore.get(COOKIE_NAME)
    if (preferenceCookie?.value) {
      try {
        const preferences = JSON.parse(preferenceCookie.value)
        
        // ジャンルの検証（有効なジャンルのみ許可）
        const validGenres = ['all', 'game', 'anime', 'vocaloid', 'voicesynthesis', 'entertainment', 'music', 'sing', 'dance', 'play', 'commentary', 'cooking', 'travel', 'nature', 'vehicle', 'technology', 'society', 'mmd', 'vtuber', 'radio', 'sports', 'animal', 'other']
        const validPeriods = ['24h', 'hour']
        
        if (!genre && preferences.lastGenre && validGenres.includes(preferences.lastGenre)) {
          genre = preferences.lastGenre
        }
        if (!period && preferences.lastPeriod && validPeriods.includes(preferences.lastPeriod)) {
          period = preferences.lastPeriod
        }
        if (!tag && preferences.lastTag) {
          tag = preferences.lastTag
        }
      } catch {
        // パースエラーは無視
      }
    }
  }
  
  // デフォルト値を設定
  genre = genre || 'all'
  period = period || '24h'
  page = Math.max(1, page || 1) // ページは最低1
  
  try {
    const dataFetchStart = Date.now()
    const { items: rankingData, popularTags = [] } = await fetchRankingDataDirect(genre, period, tag)
    const dataFetchTime = Date.now() - dataFetchStart
    
    // Performance logging (development only)
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log(`[PERF] Params: ${paramsTime}ms, Data fetch: ${dataFetchTime}ms, Total: ${Date.now() - startTime}ms`)
    }

    if (rankingData.length === 0) {
      // タグ検索でデータがない場合は、タグなしでリダイレクト
      if (tag) {
        const { redirect } = await import('next/navigation')
        const params = new URLSearchParams()
        if (genre !== 'all') params.set('genre', genre)
        if (period && period !== '24h') params.set('period', period)
        const redirectUrl = params.toString() ? `/?${params.toString()}` : '/'
        redirect(redirectUrl)
      }
      
      // ジャンル自体のデータがない場合は総合ランキングへリダイレクト
      if (genre !== 'all') {
        const { redirect } = await import('next/navigation')
        redirect('/')
      }
      
      // 総合ランキングでもデータがない場合のみエラーページを表示
      const EmptyRankingPage = (await import('@/components/empty-ranking-page')).default
      return <EmptyRankingPage tag={tag} />
    }

    // 真のページネーション: 現在のページのアイテムのみをSSRで送信
    const ITEMS_PER_PAGE = 100
    const startIndex = (page - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    const currentPageItems = rankingData.slice(startIndex, endIndex)

    return (
      <main style={{ 
        padding: '0',
        // CLS対策: フッターマージンを考慮したminHeight
        minHeight: 'calc(100vh - 80px)',
        background: 'var(--background-color)'
      }}>
        <HeaderWithSettings />
        
        <div 
          className="main-container-responsive"
          style={{ 
            maxWidth: '1200px', 
            margin: '0 auto',
            padding: '20px',
            minHeight: 'calc(100vh - 100px)' // ヘッダー分を引いた最小高さを確保
          }}>
          <SuspenseWrapper>
            <ClientPage 
              initialData={{ items: currentPageItems, popularTags }} 
              allRankingData={rankingData}
              initialGenre={genre}
              initialPeriod={period}
              initialTag={tag}
              initialPage={page}
              popularTags={popularTags}
            />
          </SuspenseWrapper>
        </div>
        <Footer />
      </main>
    )
  } catch (error: any) {
    // Next.js の redirect() によるエラーはそのまま再スロー
    if (error?.digest === 'NEXT_REDIRECT' || error?.message?.includes('NEXT_REDIRECT')) {
      throw error
    }
    
    // その他のエラーの場合はエラーページを表示
    console.error('[SSR] Unexpected error:', error)
    const { notFound } = await import('next/navigation')
    notFound()
  }
}