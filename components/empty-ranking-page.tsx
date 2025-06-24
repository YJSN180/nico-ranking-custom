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
          <button
            onClick={() => {
              if (tag) {
                const genre = searchParams.get('genre') || 'all'
                const period = searchParams.get('period') || '24h'
                const params = new URLSearchParams()
                if (genre !== 'all') params.set('genre', genre)
                if (period !== '24h') params.set('period', period)
                const redirectUrl = params.toString() ? `/?${params.toString()}` : '/'
                router.push(redirectUrl)
              } else {
                router.push('/')
              }
            }}
            style={{
              background: 'var(--primary-color)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 24px',
              fontSize: '1rem',
              cursor: 'pointer',
              marginTop: '24px',
              transition: 'opacity 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            {tag ? 'タグなしのランキングへ' : '総合ランキングへ'}
          </button>
        </div>
      </div>
    </main>
  )
}