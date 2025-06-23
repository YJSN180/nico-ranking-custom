'use client'

import { HeaderWithSettings } from '@/components/header-with-settings'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

interface EmptyRankingPageProps {
  tag?: string
}

export default function EmptyRankingPage({ tag }: EmptyRankingPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  useEffect(() => {
    // 現在のパラメータを取得
    const genre = searchParams.get('genre') || 'all'
    const period = searchParams.get('period') || '24h'
    
    // 適切なURLへリダイレクト
    const timer = setTimeout(() => {
      if (tag) {
        // タグが原因の場合はタグなしのURLへ
        const params = new URLSearchParams()
        if (genre !== 'all') params.set('genre', genre)
        if (period !== '24h') params.set('period', period)
        const redirectUrl = params.toString() ? `/?${params.toString()}` : '/'
        router.push(redirectUrl)
      } else if (genre !== 'all') {
        // ジャンルが原因の場合は総合ランキングへ
        router.push('/')
      } else {
        // 総合ランキングでもデータがない場合のみリロード
        window.location.reload()
      }
    }, 5000) // 5秒後にリダイレクト

    return () => clearTimeout(timer)
  }, [router, searchParams, tag])

  return (
    <main style={{ 
      padding: '0',
      minHeight: '100vh',
      background: 'var(--background-color)'
    }}>
      <HeaderWithSettings />
      
      <div style={{ 
        maxWidth: '600px', 
        margin: '0 auto',
        padding: '0 20px',
        textAlign: 'center'
      }}>
        <div style={{
          background: 'var(--surface-color)',
          borderRadius: '16px',
          padding: '60px 40px',
          boxShadow: 'var(--shadow-md)'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>📊</div>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '1.5rem', marginBottom: '16px' }}>
            {tag ? 'このタグの動画が見つかりません' : 'ランキングデータがありません'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6', marginBottom: '8px' }}>
            {tag ? '別のタグをお試しください。' : 'データを取得中です。しばらくお待ちください。'}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            5秒後に{tag ? 'タグなしのランキング' : searchParams.get('genre') !== 'all' ? '総合ランキング' : '再読み込み'}に移動します...
          </p>
        </div>
      </div>
    </main>
  )
}