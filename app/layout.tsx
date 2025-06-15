import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { ThemeProvider } from '@/components/theme-provider'
import { WebVitalsReporter } from '@/components/web-vitals-reporter'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ニコニコランキング(Re:turn)',
  description: 'ニコニコ動画のランキングを今すぐチェック！',
  metadataBase: new URL('https://nico-rank.com'),
  openGraph: {
    title: 'ニコニコランキング(Re:turn)',
    description: 'ニコニコ動画のランキングを今すぐチェック！',
    url: 'https://nico-rank.com',
    siteName: 'ニコニコランキング(Re:turn)',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ニコニコランキング(Re:turn)',
      }
    ],
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ニコニコランキング(Re:turn)',
    description: 'ニコニコ動画のランキングを今すぐチェック！',
    images: ['/og-image.png'],
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
    name: 'ニコニコランキング(Re:turn)',
    alternateName: 'ニコランキング',
    url: 'https://nico-rank.com',
    description: 'ニコニコ動画の24時間・毎時ランキングを高速表示。人気タグ別ランキング、NGフィルター機能搭載。',
    publisher: {
      '@type': 'Organization',
      name: 'ニコニコランキング(Re:turn)',
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
    <html lang="ja">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0080ff" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={inter.className}>
        <Script src="/theme-script.js" strategy="beforeInteractive" />
        <ThemeProvider>
          <WebVitalsReporter />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}