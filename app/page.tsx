import type { Metadata } from 'next'
import type { RankingData, RankingItem } from '@/types/ranking'
// Use standard version with client-side data fetching
import ClientPage from './client-page'
import { HeaderWithSettings } from '@/components/header-with-settings'
import { SuspenseWrapper } from '@/components/suspense-wrapper'
import { FooterLazy } from '@/components/footer-lazy'
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
  let genreName = genreInfo?.label || '総合'
  const periodName = period === '24h' ? '24時間' : '毎時'
  
  // カスタムジャンルの場合はカスタムランキング名を使用（SSRではlocalStorageが使えないため、仮の名前を使用）
  if (genre === 'custom') {
    genreName = 'カスタム'
  }
  
  // デフォルト（総合・24時間・タグなし）の場合はシンプルなタイトルと説明
  const isDefault = genre === 'all' && period === '24h' && !tag
  
  let title = isDefault ? 'ニコラン(Re:turn) - ニコニコ動画のランキングを快適に表示' : `${genreName} ${periodName}ランキング - ニコラン(Re:turn)`
  let description = isDefault ? 'ニコニコ動画の人気動画ランキングを快適に閲覧。毎時・24時間のランキングを各ジャンルごとに表示。話題の動画を見逃さずチェック！' : `ニコニコ動画の${genreName}ジャンル ${periodName}ランキング。`
  
  if (tag && !tag.startsWith('custom:')) {
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
  
  // genre='custom'の場合、tagからカスタムランキングIDを取得してbaseGenreを使用
  let actualGenre = genre
  let actualTag = tag
  if (genre === 'custom') {
    // サーバーサイドではlocalStorageが使えないため、空データを返す
    // クライアントサイドでデータ取得される
    return { items: [], popularTags: [] }
  }
  
  const params = new URLSearchParams()
  params.set('genre', actualGenre)
  params.set('period', period)
  if (actualTag && !actualTag.startsWith('custom:')) params.set('tag', actualTag)
  
  const isProduction = process.env.VERCEL_ENV === 'production'
  const hasWorkerKey = Boolean(process.env.WORKER_AUTH_KEY)
  const shouldUseSignedWorker = isProduction && hasWorkerKey

  const resolveBaseUrl = () => {
    const explicitSite = process.env.NEXT_PUBLIC_SITE_URL
    if (explicitSite) return explicitSite.replace(/\/$/, '')
    const vercelUrl = process.env.VERCEL_URL
    if (vercelUrl) {
      const normalized = vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`
      return normalized.replace(/\/$/, '')
    }
    return process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://nico-ranking-custom.vercel.app'
  }

  const signedWorkerBase = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'https://nico-rank.com'
  const proxyBase = resolveBaseUrl()
  const apiUrl = shouldUseSignedWorker
    ? `${signedWorkerBase.replace(/\/$/, '')}/api/ranking?${params.toString()}`
    : `${proxyBase}/api/ranking?${params.toString()}`

  try {
    const headers: HeadersInit = {
      'Accept-Encoding': 'gzip, deflate, br',
      Accept: 'application/json'
    }
    if (shouldUseSignedWorker && process.env.WORKER_AUTH_KEY) {
      headers['X-Worker-Auth'] = process.env.WORKER_AUTH_KEY
      headers['X-SSR-Request'] = 'true'
    }

    const logEmpty = (meta: Record<string, unknown>) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[SSR] Empty items', meta)
      }
    }

    const doFetch = async (url: string, options?: RequestInit) => {
      const res = await fetch(url, options)
      const meta = {
        status: res.status,
        statusText: res.statusText,
        contentLength: res.headers.get('content-length'),
        cacheControl: res.headers.get('cache-control'),
        cfCacheStatus: res.headers.get('cf-cache-status'),
        etag: res.headers.get('etag'),
        url
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

      let json: any
      try {
        json = await res.clone().json()
      } catch {
        const text = await res.text()
        json = JSON.parse(text)
      }
      return { json, meta }
    }

    const buildResult = async (data: any, meta: Record<string, unknown>) => {
      if (!data || !Array.isArray(data.items)) throw new Error('Invalid data structure: missing items array')
      const { filteredData } = await filterRankingDataServer(data)
      if (filteredData.items.length === 0) logEmpty(meta)
      return filteredData
    }

    // 1st: 通常キャッシュ経路
    const { json: primaryJson, meta: primaryMeta } = await doFetch(apiUrl, {
      next: { revalidate: 1200 },
      headers
    })
    const primaryResult = await buildResult(primaryJson, primaryMeta)

    // 空配列だった場合のみ cache-bust 再取得（偶発的な空キャッシュを避ける）
    if (primaryResult.items.length === 0) {
      const cacheBustUrl = `${apiUrl}&_cb=${Date.now()}`
      const { json: freshJson, meta: freshMeta } = await doFetch(cacheBustUrl, {
        cache: 'no-store',
        headers: {
          ...headers,
          'Cache-Control': 'no-cache'
        }
      })
      return await buildResult(freshJson, { ...freshMeta, cacheBust: true })
    }

    return primaryResult
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[SSR] API error:', error instanceof Error ? error.message : String(error))
    }
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
  let ranking = params.ranking as string | undefined
  let page = parseInt((params.page as string) || '1', 10)
  
  // Cookieから設定を読み取る（無効なジャンルを除外）
  if (!genre || !period) {
    const preferenceCookie = cookieStore.get(COOKIE_NAME)
    if (preferenceCookie?.value) {
      try {
        const preferences = JSON.parse(preferenceCookie.value)
        // デバッグログ
        // eslint-disable-next-line no-console
        console.log('[SSR] Cookie preferences:', preferences)
        
        // ジャンルの検証（有効なジャンルのみ許可）
        const validGenres = ['all', 'game', 'anime', 'vocaloid', 'voicesynthesis', 'entertainment', 'music', 'sing', 'dance', 'play', 'commentary', 'cooking', 'travel', 'nature', 'vehicle', 'technology', 'society', 'mmd', 'vtuber', 'radio', 'sports', 'animal', 'other', 'custom']
        const validPeriods = ['24h', 'hour']
        
        if (!genre && preferences.lastGenre && validGenres.includes(preferences.lastGenre)) {
          genre = preferences.lastGenre
        }
        if (!period && preferences.lastPeriod && validPeriods.includes(preferences.lastPeriod)) {
          period = preferences.lastPeriod
        }
        if (!tag && preferences.lastTag) {
          tag = preferences.lastTag
          // カスタムランキングの場合、genreも'custom'に設定
          if (tag.startsWith('custom:') && !genre) {
            genre = 'custom'
          }
        }
      } catch {
        // パースエラーは無視
      }
    }
  }
  
  // デフォルト値を設定（カスタムランキングの場合はgenreを維持）
  if (!genre) {
    // tagがcustom:で始まる場合はgenreをcustomに設定
    if (tag?.startsWith('custom:')) {
      genre = 'custom'
    } else {
      genre = 'all'
    }
  }
  period = period || '24h'
  page = Math.max(1, page || 1) // ページは最低1
  
  try {
    // console.log(`[SSR] Attempting to fetch: genre=${genre}, period=${period}, tag=${tag}`)
    
    const { items: rankingData, popularTags = [] } = await fetchRankingData(genre, period, tag)

    // カスタムジャンルの場合は、データが空でも通常のページをレンダリング
    if (rankingData.length === 0 && genre !== 'custom') {
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
      // ただし、カスタムジャンルは除外（データがなくても正常）
      if (genre !== 'all' && genre !== 'custom') {
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
              initialRanking={ranking}
              initialPage={page}
              popularTags={popularTags}
            />
          </SuspenseWrapper>
        </div>
        <FooterLazy />
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
