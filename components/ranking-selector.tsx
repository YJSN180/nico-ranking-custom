'use client'

import { GENRE_LABELS, PERIOD_LABELS } from '@/types/ranking-config'
import type { RankingGenre, RankingPeriod, RankingConfig } from '@/types/ranking-config'

interface RankingSelectorProps {
  config: RankingConfig
  onConfigChange: (config: RankingConfig) => void
}

export function RankingSelector({ config, onConfigChange }: RankingSelectorProps) {
  const handlePeriodChange = (period: RankingPeriod) => {
    onConfigChange({ ...config, period })
  }

  const handleGenreChange = (genre: RankingGenre) => {
    // ジャンル変更時はタグをリセット
    onConfigChange({ ...config, genre, tag: undefined })
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      padding: '16px',
      background: 'white',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      marginBottom: '24px'
    }}>
      {/* 期間セレクター */}
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>
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
                borderColor: config.period === value ? '#667eea' : '#e5e5e5',
                background: config.period === value ? '#667eea' : 'white',
                color: config.period === value ? 'white' : '#333',
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
        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>
          ジャンル
        </h3>
        <select
          value={config.genre}
          onChange={(e) => handleGenreChange(e.target.value as RankingGenre)}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: '14px',
            border: '1px solid #e5e5e5',
            borderRadius: '6px',
            background: 'white',
            cursor: 'pointer',
            outline: 'none'
          }}
        >
          {(Object.entries(GENRE_LABELS) as [RankingGenre, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}