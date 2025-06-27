import { MylistDetailClient } from './mylist-detail-client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'マイリスト詳細 | ニコラン(Re:turn)',
  description: 'マイリストの動画一覧',
}

export default function MylistDetailPage() {
  return <MylistDetailClient />
}