import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { ThemeProvider } from '@/components/theme-provider'
import { MylistOperationsProvider } from '@/context/mylist-operations-context'
import { ClientOnlyWebVitals } from '@/components/client-only-web-vitals'
import { OfflineIndicator } from '@/components/offline-indicator'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400','600','700'],
  variable: '--font-inter'
})

export const metadata: Metadata = {
  title: 'ニコラン(Re:turn) - ニコニコ動画のランキングを快適に表示',
  description: 'ニコニコ動画の人気動画ランキングを快適に閲覧。毎時・24時間のランキングを各ジャンルごとに表示。話題の動画を見逃さずチェック！',
  metadataBase: new URL('https://nico-rank.com'),
  openGraph: {
    title: 'ニコラン(Re:turn) - ニコニコ動画のランキングを快適に表示',
    description: 'ニコニコ動画の人気動画ランキングを快適に閲覧。毎時・24時間のランキングを各ジャンルごとに表示。話題の動画を見逃さずチェック！',
    url: 'https://nico-rank.com',
    siteName: 'ニコラン(Re:turn)',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ニコラン(Re:turn)',
        type: 'image/png',
      }
    ],
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ニコラン(Re:turn) - ニコニコ動画のランキングを快適に表示',
    description: 'ニコニコ動画の人気動画ランキングを快適に閲覧。毎時・24時間のランキングを各ジャンルごとに表示。話題の動画を見逃さずチェック！',
    images: ['https://nico-rank.com/og-image.png'], // 絶対URLで指定
    creator: '@nico_rank', // 必要に応じてTwitterアカウントを設定
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ニコラン(Re:turn)',
    alternateName: 'ニコラン',
    url: 'https://nico-rank.com',
    description: 'ニコニコ動画の24時間・毎時ランキングを高速表示。人気タグ別ランキング、NGフィルター機能搭載。',
    publisher: {
      '@type': 'Organization',
      name: 'ニコラン(Re:turn)',
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://nico-rank.com/?tag={search_term_string}'
      },
      'query-input': 'required name=search_term_string'
    },
    inLanguage: 'ja',
  }

  return (
    <html lang="ja" data-theme="light" suppressHydrationWarning>
      <head>
        {/* クライアントでテーマ適用（サーバー側での cookies 参照を排除） */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const pref = localStorage.getItem('user-preferences')
                if (pref) {
                  const { theme } = JSON.parse(pref)
                  if (theme) document.documentElement.setAttribute('data-theme', theme)
                }
              } catch (e) {
                // noop
              }
            `
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0080ff" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* DNS プリフェッチとプリコネクトでAPIレスポンスを高速化 */}
        <link rel="dns-prefetch" href="https://nicovideo.cdn.nimg.jp" />
        <link rel="dns-prefetch" href="https://tn.smilevideo.jp" />
        <link rel="dns-prefetch" href="https://secure-dcdn.cdn.nimg.jp" />
        <link rel="preconnect" href="https://nicovideo.cdn.nimg.jp" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://tn.smilevideo.jp" crossOrigin="anonymous" />
        {/* フォントは next/font に集約。手動プリロードやインラインfont-faceは削除。 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider>
          <MylistOperationsProvider>
            <ClientOnlyWebVitals />
            <OfflineIndicator />
            {children}
            {process.env.NODE_ENV !== 'test' && <Analytics />}
            {process.env.NODE_ENV !== 'test' && <SpeedInsights />}
          </MylistOperationsProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
