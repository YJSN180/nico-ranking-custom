import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ニコニコ24h総合ランキング',
  description: 'ニコニコ動画の24時間総合ランキングを表示',
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // 初回ロード時のテーマフラッシュを防ぐ
              (function() {
                try {
                  const saved = localStorage.getItem('user-preferences');
                  if (saved) {
                    const prefs = JSON.parse(saved);
                    const theme = prefs.theme || 'light';
                    document.documentElement.setAttribute('data-theme', theme);
                  }
                } catch (e) {
                  // エラー時は何もしない
                }
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}