import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { ThemeProvider } from '@/components/theme-provider'
import { MylistOperationsProvider } from '@/context/mylist-operations-context'
import { ClientOnlyWebVitals } from '@/components/client-only-web-vitals'
import { OfflineIndicator } from '@/components/offline-indicator'
import { ServiceWorkerClearer } from '@/components/sw-cache-clearer'
import './globals.css'

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  preload: true,
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
        {/* フォントのプリロード - WOFF2を最優先で読み込む */}
        <link rel="preload" href="/fonts/nicomoji-plus-v2.woff2" as="font" type="font/woff2" crossOrigin="anonymous" fetchPriority="high" />
        <link rel="preload" href="/fonts/comic-sans-ms-bold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" fetchPriority="high" />
        {/* クリティカルCSSをインライン化 */}
        <style dangerouslySetInnerHTML={{ __html: `
          /* クリティカルフォント定義 - WOFF2優先フォールバック戦略 */
          @font-face{font-family:'Nicomoji Plus v2';src:url('/fonts/nicomoji-plus-v2.woff2') format('woff2'),url('/fonts/nicomoji-plus-v2.ttf') format('truetype');font-weight:normal;font-style:normal;font-display:fallback;size-adjust:85%;ascent-override:85%;descent-override:15%;line-gap-override:0%}
          @font-face{font-family:'Comic Sans MS Bold';src:url('/fonts/comic-sans-ms-bold.woff2') format('woff2'),url('/fonts/comic-sans-ms-bold.ttf') format('truetype');font-weight:bold;font-style:normal;font-display:fallback;size-adjust:98%;ascent-override:90%;descent-override:23%;line-gap-override:0%}
          /* クリティカルCSS - LCPに必要な最小限のスタイル */
          body{margin:0;padding:0;color:#333;background-color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
          /* テーマのデフォルトスタイル - ちらつき防止 */
          [data-theme="dark"] body{color:#fff;background-color:#121212}
          [data-theme="darkblue"] body{color:#fff;background-color:#15202b}
          .header-container{background:linear-gradient(135deg,#0066CC 0%,#004B99 100%);padding:8px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:20px}
          .selectors-container{min-height:200px}
          .ranking-video-link{color:#0066cc;text-decoration:none}
          .ranking-video-link--desktop{font-size:16px;font-weight:600;line-height:1.4;display:block;margin-bottom:6px;word-break:break-word}
          .ranking-item-responsive__title{color:var(--link-color);text-decoration:none;font-size:16px;font-weight:600;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
          [data-testid="ranking-item"]{background:transparent;border:0;border-bottom:1px solid var(--border-color,#e5e5e5);border-radius:0;margin-bottom:0;padding:0}
          .skeleton-pulse{animation:skeleton-pulse 1.5s ease-in-out infinite alternate}
          @keyframes skeleton-pulse{0%{opacity:0.6}100%{opacity:1}}
          @media(max-width:640px){.header-container{padding:5px 12px}.selectors-container{min-height:250px}.ranking-video-link--mobile{font-size:15px;font-weight:600;line-height:1.3}.ranking-item-responsive__title{font-size:15px;line-height:1.3;-webkit-line-clamp:2}}
        ` }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ServiceWorkerClearer />
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
