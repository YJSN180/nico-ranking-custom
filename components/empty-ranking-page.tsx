'use client'

import { HeaderWithSettings } from '@/components/header-with-settings'
import { useEffect } from 'react'

interface EmptyRankingPageProps {
  tag?: string
}

export default function EmptyRankingPage({ tag }: EmptyRankingPageProps) {
  useEffect(() => {
    // クライアントサイドで定期的に再試行
    const timer = setTimeout(() => {
      window.location.reload()
    }, 5000) // 5秒後に自動リロード

    return () => clearTimeout(timer)
  }, [])

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
            5秒後に自動的に再読み込みします...
          </p>
        </div>
      </div>
    </main>
  )
}