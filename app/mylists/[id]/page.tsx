import { MylistDetailClient } from './mylist-detail-client'
import { HeaderWithSettings } from '@/components/header-with-settings'
import { FooterLazy } from '@/components/footer-lazy'
import { ErrorBoundary } from '@/components/error-boundary'
import { ScrollToTopButton } from '@/components/scroll-to-top-button'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'マイリスト詳細 | ニコラン(Re:turn)',
  description: 'マイリストの動画一覧',
}

export default function MylistDetailPage() {
  return (
    <>
      <HeaderWithSettings />
      <ErrorBoundary>
        <MylistDetailClient />
      </ErrorBoundary>
      <ScrollToTopButton />
      <FooterLazy />
    </>
  )
}