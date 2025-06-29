import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { cookies } from 'next/headers'
import { ThemeProvider } from '@/components/theme-provider'
import { ClientOnlyWebVitals } from '@/components/client-only-web-vitals'
import './globals.css'

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  preload: false, // LCP改善のためプリロードを無効化
  adjustFontFallback: true, // フォールバックフォントの最適化
  variable: '--font-inter'  // CSS変数として使用
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
        {/* DNS プリフェッチとプリコネクトでAPIレスポンスを高速化 */}
        <link rel="dns-prefetch" href="https://nicovideo.cdn.nimg.jp" />
        <link rel="dns-prefetch" href="https://tn.smilevideo.jp" />
        <link rel="dns-prefetch" href="https://secure-dcdn.cdn.nimg.jp" />
        <link rel="preconnect" href="https://nicovideo.cdn.nimg.jp" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://tn.smilevideo.jp" crossOrigin="anonymous" />
        {/* フォントのプリロード - WOFF2を最優先で読み込む */}
        <link rel="preload" href="/fonts/nicomoji-plus-v2.woff2" as="font" type="font/woff2" crossOrigin="anonymous" fetchPriority="high" />
        <link rel="preload" href="/fonts/comic-sans-ms-bold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* クリティカルCSSをインライン化 */}
        <style dangerouslySetInnerHTML={{ __html: `
          /* クリティカルフォント定義 - WOFF2優先フォールバック戦略 */
          @font-face{font-family:'Nicomoji Plus v2';src:url('/fonts/nicomoji-plus-v2.woff2') format('woff2'),url('/fonts/nicomoji-plus-v2.ttf') format('truetype');font-weight:normal;font-style:normal;font-display:swap;size-adjust:85%;ascent-override:85%;descent-override:15%;line-gap-override:0%}
          @font-face{font-family:'Comic Sans MS Bold';src:url('/fonts/comic-sans-ms-bold.woff2') format('woff2'),url('/fonts/comic-sans-ms-bold.ttf') format('truetype');font-weight:bold;font-style:normal;font-display:swap;size-adjust:98%;ascent-override:90%;descent-override:23%;line-gap-override:0%}
          /* クリティカルCSS - LCPに必要な最小限のスタイル */
          body{margin:0;padding:0;color:#333;background-color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
          /* テーマのデフォルトスタイル - ちらつき防止 */
          [data-theme="dark"] body{color:#fff;background-color:#121212}
          [data-theme="darkblue"] body{color:#fff;background-color:#15202b}
          .header-container{background:linear-gradient(135deg,#0066CC 0%,#004B99 100%);padding:8px 20px;margin-bottom:20px}
          [data-testid="ranking-item"]{background:#fff;border:1px solid #e5e5e5;border-radius:8px;margin-bottom:12px;padding:16px}
          @media(max-width:640px){.header-container{padding:5px 12px}}
        ` }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider>
          <ClientOnlyWebVitals />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}