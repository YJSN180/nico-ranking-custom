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
        {/* フォントのプリロード - ヘッダーで必須のため最優先で読み込む */}
        <link rel="preload" href="/fonts/nicomoji-plus-v2.ttf" as="font" type="font/ttf" crossOrigin="anonymous" fetchPriority="high" />
        <link rel="preload" href="/fonts/comic-sans-ms-bold.ttf" as="font" type="font/ttf" crossOrigin="anonymous" fetchPriority="high" />
        {/* クリティカルCSSをインライン化 */}
        <style dangerouslySetInnerHTML={{ __html: `
          /* クリティカルフォント定義 - ヘッダー高速レンダリング用 */
          @font-face{font-family:'Nicomoji Plus v2';src:url('/fonts/nicomoji-plus-v2.ttf') format('truetype');font-weight:normal;font-style:normal;font-display:swap;size-adjust:85%;ascent-override:85%;descent-override:15%;line-gap-override:0%}
          @font-face{font-family:'Comic Sans MS Bold';src:url('/fonts/comic-sans-ms-bold.ttf') format('truetype');font-weight:bold;font-style:normal;font-display:swap;size-adjust:98%;ascent-override:90%;descent-override:23%;line-gap-override:0%}
          /* クリティカルCSS - LCPに必要な最小限のスタイル */
          body{margin:0;padding:0;color:#333;background-color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
          .header-container{background:linear-gradient(135deg,#00A8E8 0%,#0077BE 100%);padding:8px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:20px}
          .selectors-container{min-height:200px}
          .ranking-video-link{color:#0066cc;text-decoration:none}
          .ranking-video-link--desktop{font-size:16px;font-weight:600;line-height:1.4;display:block;margin-bottom:6px;word-break:break-word}
          .ranking-item-responsive__title{color:var(--link-color);text-decoration:none;font-size:16px;font-weight:600;line-height:1.4;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:6px;word-break:break-word}
          [data-testid="ranking-item"]{background:#fff;border:1px solid #e5e5e5;border-radius:8px;margin-bottom:12px;padding:16px}
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
        <Script src="/theme-script.js" strategy="beforeInteractive" />
        <ThemeProvider>
          <WebVitalsReporter />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}