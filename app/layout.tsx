import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { StagewiseToolbar } from '@stagewise/toolbar-next'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ニコニコ24h総合ランキング',
  description: 'ニコニコ動画の24時間総合ランキングを表示',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=5',
}

const stagewiseConfig = {
  plugins: []
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        {children}
        {process.env.NODE_ENV === 'development' && <StagewiseToolbar config={stagewiseConfig} />}
      </body>
    </html>
  )
}