'use client'

import { memo } from 'react'

// スケルトンスクリーン: 実際のランキングアイテムのレイアウトにマッチ
const InitialRankingSkeleton = memo(function InitialRankingSkeleton({ itemCount = 5 }: { itemCount?: number }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {Array.from({ length: itemCount }, (_, index) => (
        <li 
          key={index}
          data-testid="ranking-skeleton-item"
          className="ranking-item-responsive"
          style={{
            background: 'transparent',
            borderBottom: '1px solid var(--border-color)',
            position: 'relative'
          }}
        >
          <div className="ranking-item-responsive__content">
            {/* デスクトップ用順位スケルトン */}
            <div 
              className="ranking-item-responsive__rank ranking-item-responsive__rank--desktop skeleton-pulse"
              style={{
                background: 'var(--surface-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                minWidth: '44px',
                height: '44px'
              }}
            />
            
            {/* サムネイルスケルトン */}
            <div className="ranking-item-responsive__thumbnail">
              {/* モバイル用順位オーバーレイスケルトン */}
              <div 
                className="ranking-item-responsive__rank ranking-item-responsive__rank--mobile skeleton-pulse"
                style={{
                  background: 'var(--surface-secondary)'
                }}
              />
              <div
                className="skeleton-pulse"
                style={{ 
                  width: '100%',
                  height: 'auto',
                  aspectRatio: '16 / 9',
                  background: 'var(--surface-secondary)',
                  borderRadius: '4px'
                }}
              />
            </div>
            
            {/* コンテンツエリアスケルトン */}
            <div className="ranking-item-responsive__details">
              {/* タイトルスケルトン */}
              <div 
                className="ranking-item-responsive__title skeleton-pulse"
                style={{
                  height: '22px',
                  background: 'var(--surface-secondary)',
                  borderRadius: '4px',
                  marginBottom: '6px'
                }}
              />
              
              {/* 投稿者情報スケルトン */}
              <div className="ranking-item-responsive__author">
                <div
                  className="skeleton-pulse"
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'var(--surface-secondary)',
                    flexShrink: 0
                  }}
                />
                <div
                  className="skeleton-pulse"
                  style={{
                    width: '100px',
                    height: '14px',
                    background: 'var(--surface-secondary)',
                    borderRadius: '4px'
                  }}
                />
                <span className="ranking-item-responsive__separator">·</span>
                <div
                  className="skeleton-pulse"
                  style={{
                    width: '60px',
                    height: '13px',
                    background: 'var(--surface-secondary)',
                    borderRadius: '4px'
                  }}
                />
              </div>
              
              {/* 統計情報スケルトン */}
              <div className="ranking-item-responsive__stats">
                {['▶️', '💬', '❤️', '📁'].map((emoji, statIndex) => (
                  <div key={statIndex} className="ranking-item-responsive__stat" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>{emoji}</span>
                    <div
                      className="skeleton-pulse"
                      style={{
                        width: '40px',
                        height: '14px',
                        background: 'var(--surface-secondary)',
                        borderRadius: '4px'
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
})

export default InitialRankingSkeleton