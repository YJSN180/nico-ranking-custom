import { Metadata } from 'next'
import { WatchHistoryPage } from './watch-history-client'
import { HeaderWithSettings } from '@/components/header-with-settings'
import { Footer } from '@/components/footer'

export const metadata: Metadata = {
  title: '視聴履歴 | ニコラン(Re:turn)',
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
  return (
    <main style={{ 
      padding: '0',
      minHeight: 'calc(100vh - 80px)',
      background: 'var(--background-color)'
    }}>
      <HeaderWithSettings />
      <div 
        className="main-container-responsive"
        style={{ 
          maxWidth: '1200px', 
          margin: '0 auto',
          padding: '20px',
          minHeight: 'calc(100vh - 100px)'
        }}>
        <WatchHistoryPage />
      </div>
      <Footer />
    </main>
  )
}