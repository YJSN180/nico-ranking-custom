import { Metadata } from 'next'
import { WatchHistoryPage } from './watch-history-client'

export const metadata: Metadata = {
  title: '視聴履歴 - ニコニコ動画ランキング',
  description: 'あなたの視聴履歴を管理できます。過去に視聴した動画の一覧表示、検索、マイリストへの追加が可能です。',
  openGraph: {
    title: '視聴履歴 - ニコニコ動画ランキング',
    description: 'あなたの視聴履歴を管理できます。',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: '視聴履歴 - ニコニコ動画ランキング',
    description: 'あなたの視聴履歴を管理できます。',
  },
  robots: {
    index: false, // 個人情報を含むページなのでインデックスしない
    follow: true,
  },
}

export default function Page() {
  return <WatchHistoryPage />
}