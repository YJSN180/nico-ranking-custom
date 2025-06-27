import { MylistsClient } from './mylists-client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'マイリスト | ニコラン(Re:turn)',
  description: 'お気に入りの動画をマイリストで管理',
}

export default function MylistsPage() {
  return <MylistsClient />
}