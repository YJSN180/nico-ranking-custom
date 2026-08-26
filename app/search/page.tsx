import { Suspense } from 'react'
import type { Metadata } from 'next'
import { HeaderWithSettings } from '@/components/header-with-settings'
import { FooterLazy } from '@/components/footer-lazy'
import { SearchClient } from './search-client'

export const metadata: Metadata = {
  title: '動画検索 | ニコラン(Re:turn)',
  description:
    'ニコニコ動画の動画を再生数・コメント数・いいね数・マイリスト数・投稿日時・再生時間・ジャンルなどの条件で検索。',
}

export default function SearchPage() {
  return (
    <main
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
        <Suspense fallback={null}>
          <SearchClient />
        </Suspense>
      </div>
      <FooterLazy />
    </main>
  )
}
