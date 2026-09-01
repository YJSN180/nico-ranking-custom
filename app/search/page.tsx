import type { Metadata } from 'next'
import { HeaderWithSettings } from '@/components/header-with-settings'
import { FooterLazy } from '@/components/footer-lazy'
import { SuspenseWrapper } from '@/components/suspense-wrapper'
import InitialRankingSkeleton from '@/components/initial-ranking-skeleton'
import { ScrollToTopButton } from '@/components/scroll-to-top-button'
import { SearchClient } from './search-client'

export const metadata: Metadata = {
  title: '動画検索 | ニコラン(Re:turn)',
  description:
    'ニコニコ動画の動画を再生数・コメント数・いいね数・マイリスト数・投稿日時・再生時間・ジャンルなどの条件で検索。',
}

export default function SearchPage() {
  return (
    <main
      id="main-content"
      style={{
        padding: '0',
        minHeight: 'calc(100vh - 80px)',
        background: 'var(--background-color)',
      }}
    >
      <HeaderWithSettings />
      <div
        className="main-container-responsive"
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '20px',
          minHeight: 'calc(100vh - 100px)',
        }}
      >
        {/* ErrorBoundary + Suspense（フェーズ4-1/4-4）。fallbackは検索結果と同型のフラットスケルトン */}
        <SuspenseWrapper fallback={<InitialRankingSkeleton itemCount={6} hideRank flat />}>
          <SearchClient />
        </SuspenseWrapper>
      </div>
      <ScrollToTopButton />
      <FooterLazy />
    </main>
  )
}
