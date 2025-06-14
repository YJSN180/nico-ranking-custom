import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ニコニコランキング(Re:turn)',
  description: 'ニコニコ動画のランキングサイト - 24時間・毎時ランキングを表示',
  metadataBase: new URL('https://nico-rank.com'),
  openGraph: {
    title: 'ニコニコランキング(Re:turn)',
    description: 'ニコニコ動画の24時間・毎時ランキングを高速表示。人気タグ別ランキング、NGフィルター機能搭載。',
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
    description: 'ニコニコ動画の24時間・毎時ランキングを高速表示',
    images: ['/og-image.png'],
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
  return (
    <html lang="ja">
      <body className={inter.className}>
        <Script src="/theme-script.js" strategy="beforeInteractive" />
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}