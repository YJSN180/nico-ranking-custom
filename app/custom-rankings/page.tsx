import { Metadata } from 'next'
import { CustomRankingsClient } from './custom-rankings-client'

export const metadata: Metadata = {
  title: 'カスタムタグランキング | ニコラン',
  description: 'タグ条件を組み合わせて自分だけのランキングを作成'
}

export default function CustomRankingsPage() {
  return <CustomRankingsClient />
}