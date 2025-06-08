'use client'

import { useRef, useEffect } from 'react'
import { GENRE_LABELS, PERIOD_LABELS } from '@/types/ranking-config'
import type { RankingGenre, RankingPeriod, RankingConfig } from '@/types/ranking-config'
import { useMobileDetect } from '@/hooks/use-mobile-detect'

interface RankingSelectorProps {
  config: RankingConfig
  onConfigChange: (config: RankingConfig) => void
}

export function RankingSelector({ config, onConfigChange }: RankingSelectorProps) {
  const isMobile = useMobileDetect()
  const genreScrollRef = useRef<HTMLDivElement>(null)
  const selectedGenreRef = useRef<HTMLButtonElement>(null)

  const handlePeriodChange = (period: RankingPeriod) => {
    onConfigChange({ ...config, period })
  }

  const handleGenreChange = (genre: RankingGenre) => {
    // ジャンル変更時はタグをリセット
    onConfigChange({ ...config, genre, tag: undefined })
  }

  // 選択されたジャンルを中央にスクロール
  useEffect(() => {
    if (isMobile && selectedGenreRef.current && genreScrollRef.current) {
      const container = genreScrollRef.current
      const selected = selectedGenreRef.current
      const containerWidth = container.offsetWidth
      const selectedLeft = selected.offsetLeft
      const selectedWidth = selected.offsetWidth
      const scrollPosition = selectedLeft - (containerWidth / 2) + (selectedWidth / 2)
      
      container.scrollTo({ left: scrollPosition, behavior: 'smooth' })
    }
  }, [config.genre, isMobile])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      padding: '16px',
      background: 'var(--surface-color)',
      borderRadius: '8px',
      boxShadow: 'var(--shadow-md)',
      marginBottom: '24px'
    }}>
      {/* 期間セレクター */}
      <div>
        <h3 style={{ 
          fontSize: '14px', 
          fontWeight: '600', 
          marginBottom: '8px', 
          color: 'var(--text-primary)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}>
          期間
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(Object.entries(PERIOD_LABELS) as [RankingPeriod, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => handlePeriodChange(value)}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: '500',
                border: '1px solid',
                borderColor: config.period === value ? 'var(--primary-color)' : 'var(--border-color)',
                background: config.period === value ? 'var(--primary-color)' : 'var(--surface-color)',
                color: config.period === value ? 'var(--button-text-active)' : 'var(--text-primary)',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ジャンルセレクター */}
      <div>
        <h3 style={{ 
          fontSize: '14px', 
          fontWeight: '600', 
          marginBottom: '8px', 
          color: 'var(--text-primary)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}>
          ジャンル
        </h3>
        {isMobile ? (
          <div style={{ position: 'relative' }}>
            {/* 左端のグラデーション */}
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '20px',
              background: 'linear-gradient(to right, var(--background-color), transparent)',
              zIndex: 1,
              pointerEvents: 'none'
            }} />
            {/* 右端のグラデーション */}
            <div style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '20px',
              background: 'linear-gradient(to left, var(--background-color), transparent)',
              zIndex: 1,
              pointerEvents: 'none'
            }} />
            <div 
              ref={genreScrollRef}
              style={{ 
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                paddingBottom: '2px'
              }}
            >
              {(Object.entries(GENRE_LABELS) as [RankingGenre, string][]).map(([value, label]) => (
                <button
                  key={value}
                  ref={config.genre === value ? selectedGenreRef : null}
                  onClick={() => handleGenreChange(value)}
                  style={{
                    padding: config.genre === value ? '10px 20px' : '8px 16px',
                    fontSize: config.genre === value ? '15px' : '14px',
                    fontWeight: '600',
                    border: '1px solid',
                    borderColor: config.genre === value ? 'var(--primary-color)' : 'var(--border-color)',
                    background: config.genre === value ? 'var(--primary-color)' : 'var(--surface-color)',
                    color: config.genre === value ? 'var(--button-text-active)' : 'var(--text-primary)',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    transform: config.genre === value ? 'scale(1.05)' : 'scale(1)'
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <style jsx>{`
              div::-webkit-scrollbar {
                display: none;
              }
            `}</style>
          </div>
        ) : (
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            {(Object.entries(GENRE_LABELS) as [RankingGenre, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => handleGenreChange(value)}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  border: '1px solid',
                  borderColor: config.genre === value ? 'var(--primary-color)' : 'var(--border-color)',
                  background: config.genre === value ? 'var(--primary-color)' : 'var(--surface-color)',
                  color: config.genre === value ? 'white' : 'var(--text-primary)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  minWidth: '80px'
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}