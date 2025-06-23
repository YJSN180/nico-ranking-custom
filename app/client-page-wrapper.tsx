'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { RankingItem } from '@/types/ranking'

// クライアントページを動的インポート（Suspenseなし）
const ClientPage = dynamic(() => import('./client-page'), { 
  ssr: false,
  loading: () => null // ローディング表示なし
})

interface ClientPageWrapperProps {
  initialData: { items: RankingItem[], popularTags?: string[] }
  allRankingData?: RankingItem[]
  initialGenre?: string
  initialPeriod?: string
  initialTag?: string
  initialPage?: number
  popularTags?: string[]
}

export default function ClientPageWrapper(props: ClientPageWrapperProps) {
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // クライアント側でのみClientPageをレンダリング
  if (!mounted) {
    return null
  }
  
  return <ClientPage {...props} />
}