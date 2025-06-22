import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { cookies } from 'next/headers'
import { ThemeProvider } from '@/components/theme-provider'
import { WebVitalsReporter } from '@/components/web-vitals-reporter'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ニコラン(Re:turn) - ニコニコ動画のランキングを快適に表示',
  description: 'ニコニコ動画のランキングを今すぐチェック！',
  metadataBase: new URL('https://nico-rank.com'),
  openGraph: {
    title: 'ニコラン(Re:turn) - ニコニコ動画のランキングを快適に表示',
    description: 'ニコニコ動画のランキングを今すぐチェック！',
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
    description: 'ニコニコ動画のランキングを今すぐチェック！',
    images: [{
      url: '/og-image.png',
      width: 1200,
      height: 630,
      alt: 'ニコラン(Re:turn)',
      type: 'image/png',
    }],
    creator: '@nico_rank', // 必要に応じてTwitterアカウントを設定
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default async function RootLayout({
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

  // サーバーサイドでテーマを取得
  const cookieStore = await cookies()
  const preferenceCookie = cookieStore.get('user-preferences')
  let theme = 'light'
  
  if (preferenceCookie?.value) {
    try {
      const preferences = JSON.parse(preferenceCookie.value)
      theme = preferences.theme || 'light'
    } catch {
      // デフォルトのテーマを使用
    }
  }

  return (
    <html lang="ja" data-theme={theme} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0080ff" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <Script src="/theme-script.js" strategy="beforeInteractive" />
        <ThemeProvider>
          <WebVitalsReporter />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}