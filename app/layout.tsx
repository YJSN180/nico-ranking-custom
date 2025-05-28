import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ニコニコ24h総合ランキング',
  description: 'ニコニコ動画の24時間総合ランキングを表示',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=5',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}