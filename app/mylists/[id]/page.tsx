import { MylistDetailClient } from './mylist-detail-client'
import { HeaderWithSettings } from '@/components/header-with-settings'
import { FooterLazy } from '@/components/footer-lazy'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'マイリスト詳細 | ニコラン(Re:turn)',
  description: 'マイリストの動画一覧',
}

export default function MylistDetailPage() {
  return (
    <>
      <HeaderWithSettings />
      <MylistDetailClient />
      <FooterLazy />
    </>
  )
}