import type { Metadata } from 'next'
import type { RankingData, RankingItem } from '@/types/ranking'
// Use standard version with client-side data fetching
import ClientPage from './client-page'
import { HeaderWithSettings } from '@/components/header-with-settings'
import { SuspenseWrapper } from '@/components/suspense-wrapper'
import { Footer } from '@/components/footer'
import { BrowserRecommendationSSR } from '@/components/browser-recommendation-ssr'
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
export const revalidate = 1200 // 20分間キャッシュ（鮮度重視）

// Dynamic imports for better code splitting
export const dynamic = 'force-dynamic'

// Browser recommendation component is temporarily disabled due to missing lucide-react dependency

// Prefetch hints
export const fetchCache = 'default-cache'
export const preferredRegion = 'auto'

// 静的生成を無効化（ISRのWrite Units制限のため）
// Vercel Hobbyプランは128 Write Units/月しかないため、
// 動的レンダリングに切り替えてキャッシュヘッダーで対応
// export async function generateStaticParams() {
//   return []
// }

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams
  const genre = (params.genre as RankingGenre) || 'all'
  const period = (params.period as RankingPeriod) || '24h'
  const tag = params.tag as string | undefined
  const page = parseInt((params.page as string) || '1', 10)
  
  const genreInfo = RANKING_GENRES.find(g => g.value === genre)
  const genreName = genreInfo?.label || '総合'
  const periodName = period === '24h' ? '24時間' : '毎時'
  
  // デフォルト（総合・24時間・タグなし）の場合はシンプルなタイトルと説明
  const isDefault = genre === 'all' && period === '24h' && !tag
  
  let title = isDefault ? 'ニコラン(Re:turn) - ニコニコ動画のランキングを快適に表示' : `${genreName} ${periodName}ランキング - ニコラン(Re:turn)`
  let description = isDefault ? 'ニコニコ動画の人気動画ランキングを快適に閲覧。毎時・24時間のランキングを各ジャンルごとに表示。話題の動画を見逃さずチェック！' : `ニコニコ動画の${genreName}ジャンル ${periodName}ランキング。`
  
  if (tag) {
    title = `「${tag}」タグ ${genreName} ${periodName}ランキング - ニコラン(Re:turn)`
    description = `ニコニコ動画の「${tag}」タグが付いた${genreName}動画の${periodName}ランキング。`
  }
  
  if (!isDefault) {
    description += '最新の人気動画をチェック！'
  }
  
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://nico-rank.com${params.genre ? `?genre=${genre}` : ''}${params.period ? `&period=${period}` : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`,
      images: [{
        url: '/og-image.png',
        alt: title,
      }],
    },
    twitter: {
      title,
      description,
      card: 'summary_large_image',
    },
  }
}

async function fetchRankingData(genre: string = 'all', period: string = '24h', tag?: string): Promise<{
  items: RankingItem[]
  popularTags?: string[]
}> {
  
  // Cloudflare Worker から直接データを取得（Vercel Function をバイパス）
  try {
    const params = new URLSearchParams()
    params.set('genre', genre)
    params.set('period', period)
    if (tag) params.set('tag', tag)
    
    // Cloudflare Worker のエンドポイントに直接アクセス
    const apiUrl = `https://nico-rank.com/api/ranking?${params.toString()}`
    // eslint-disable-next-line no-console
    console.log(`[SSR] Fetching directly from Cloudflare Worker: ${apiUrl}`)
    // eslint-disable-next-line no-console
    console.log(`[SSR] WORKER_AUTH_KEY present: ${!!process.env.WORKER_AUTH_KEY}`)
    // eslint-disable-next-line no-console
    console.log(`[SSR] WORKER_AUTH_KEY length: ${process.env.WORKER_AUTH_KEY?.length}`)
    // eslint-disable-next-line no-console
    console.log(`[SSR] Headers to send: X-Worker-Auth=${process.env.WORKER_AUTH_KEY ? `${process.env.WORKER_AUTH_KEY.substring(0, 10)}...` : 'missing'}, X-SSR-Request=true`)
    
    // SSRでのfetch（Node.js環境）
    const response = await fetch(apiUrl, {
      next: { revalidate: 1200 }, // 20分間キャッシュ
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'application/json',
        // Worker認証ヘッダー
        'X-Worker-Auth': process.env.WORKER_AUTH_KEY || '',
        // SSRであることを示すヘッダー
        'X-SSR-Request': 'true'
      }
    })
    
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.log(`[SSR] Response status: ${response.status}`)
      // eslint-disable-next-line no-console
      console.log(`[SSR] Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`)
      const errorText = await response.text()
      // eslint-disable-next-line no-console
      console.log(`[SSR] Error response body:`, errorText.substring(0, 500))
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    // レスポンスをテキストとして取得してJSONパース
    // Content-Encodingヘッダーの問題を回避
    let data: any
    try {
      // まずJSONとして直接パースを試みる
      data = await response.json()
    } catch (jsonError) {
      // JSONパースに失敗した場合、テキストとして取得して再度パース
      // eslint-disable-next-line no-console
      console.warn('[SSR] Initial JSON parse failed, trying text approach:', jsonError)
      const text = await response.text()
      try {
        data = JSON.parse(text)
      } catch (parseError) {
        // eslint-disable-next-line no-console
        console.error('[SSR] Failed to parse response:', parseError)
        // eslint-disable-next-line no-console
        console.error('[SSR] Response text (first 500 chars):', text.substring(0, 500))
        throw new Error('Invalid JSON response from API')
      }
    }
    
    if (data && data.items && Array.isArray(data.items)) {
      // NGフィルタリングを適用
      const { filteredData } = await filterRankingDataServer(data)
      return filteredData
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[SSR] API error:', error instanceof Error ? error.message : String(error))
    // eslint-disable-next-line no-console
    console.error(`[SSR] Error details: ${JSON.stringify({
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })}`)
  }

  // エラーの場合は空のデータを返す
  return {
    items: [],
    popularTags: []
  }
}

export default async function Home({ searchParams }: PageProps) {
  // 並列でPromiseを解決してTTFBを改善
  const [params, cookieStore] = await Promise.all([
    searchParams,
    cookies()
  ])
  
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
    // console.log(`[SSR] Attempting to fetch: genre=${genre}, period=${period}, tag=${tag}`)
    
    const { items: rankingData, popularTags = [] } = await fetchRankingData(genre, period, tag)

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

    // クライアントサイドページネーション: 全件データをクライアントに送信
    // NGリスト即座反映とパフォーマンス向上のため

    return (
      <main style={{ 
        padding: '0',
        // CLS対策: フッターマージンを考慮したminHeight
        minHeight: 'calc(100vh - 80px)',
        background: 'var(--background-color)'
      }}>
        <HeaderWithSettings />
        {/* ブラウザ推奨案内（SSR対応） */}
        <BrowserRecommendationSSR />
        
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
              initialData={{ items: rankingData, popularTags }} 
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
    // eslint-disable-next-line no-console
    console.error('[SSR] Unexpected error:', error instanceof Error ? error.message : String(error))
    const { notFound } = await import('next/navigation')
    notFound()
  }
}