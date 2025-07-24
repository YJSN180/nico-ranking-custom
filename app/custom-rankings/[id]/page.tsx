import { Metadata } from 'next'
import { CustomRankingDetailClient } from './custom-ranking-detail-client'

export const metadata: Metadata = {
  title: 'カスタムランキング詳細 | ニコラン',
  description: 'カスタムタグランキングの詳細表示'
}

interface CustomRankingDetailPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function CustomRankingDetailPage({ params }: CustomRankingDetailPageProps) {
  const { id } = await params
  return <CustomRankingDetailClient id={id} />
}