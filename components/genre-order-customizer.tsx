'use client'

import { useGenreOrder } from '@/hooks/use-genre-order'
import { GENRE_LABELS } from '@/types/ranking-config'
import type { RankingGenre } from '@/types/ranking-config'
import styles from './settings-modal.module.css'

export function GenreOrderCustomizer() {
  const {
    order,
    hidden,
    updateOrder,
    toggleGenreVisibility,
    moveGenreUp,
    moveGenreDown,
    resetToDefault
  } = useGenreOrder()

  // すべてのジャンル（表示・非表示含む）
  const allGenres = order.concat(
    Object.keys(GENRE_LABELS).filter(
      genre => !order.includes(genre as RankingGenre)
    ) as RankingGenre[]
  )

  return (
    <div className={styles.genreOrderSettings}>
      <div style={{ marginBottom: '16px' }}>
        <p style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>
          設定データは「設定データ保存」タブから保存・復元できます。
        </p>
        <button 
          onClick={resetToDefault}
          className={styles.resetButton}
          style={{
            padding: '6px 12px',
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            fontSize: '14px',
            cursor: 'pointer',
            color: 'var(--text-secondary)'
          }}
        >
          デフォルトに戻す
        </button>
      </div>

      <div className={styles.genreList}>
        {allGenres.map((genre, index) => {
          const isHidden = hidden.has(genre)
          const isFirst = index === 0
          const orderIndex = order.indexOf(genre)
          const isLast = orderIndex !== -1 && orderIndex === order.length - 1
          
          return (
            <div 
              key={genre} 
              className={`${styles.genreItem} ${isHidden ? styles.genreItemHidden : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px',
                marginBottom: '4px',
                background: isHidden ? 'var(--surface-secondary)' : 'var(--surface-hover)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                opacity: isHidden ? 0.6 : 1
              }}
            >
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => toggleGenreVisibility(genre)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '18px',
                    padding: '0',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title={isHidden ? '表示する' : '非表示にする'}
                >
                  {isHidden ? '👁️‍🗨️' : '👁️'}
                </button>
                <span style={{ fontWeight: 500 }}>{GENRE_LABELS[genre]}</span>
              </div>
              
              {!isHidden && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => moveGenreUp(genre)}
                    disabled={isFirst || !order.includes(genre)}
                    style={{
                      padding: '4px 8px',
                      background: 'var(--primary-color)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isFirst || !order.includes(genre) ? 'not-allowed' : 'pointer',
                      opacity: isFirst || !order.includes(genre) ? 0.5 : 1,
                      fontSize: '12px'
                    }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveGenreDown(genre)}
                    disabled={isLast || !order.includes(genre)}
                    style={{
                      padding: '4px 8px',
                      background: 'var(--primary-color)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isLast || !order.includes(genre) ? 'not-allowed' : 'pointer',
                      opacity: isLast || !order.includes(genre) ? 0.5 : 1,
                      fontSize: '12px'
                    }}
                  >
                    ↓
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ 
        marginTop: '16px', 
        padding: '12px', 
        background: 'var(--info-bg)', 
        borderRadius: '4px',
        fontSize: '14px',
        color: 'var(--text-secondary)'
      }}>
        <p style={{ margin: 0 }}>
          💡 ヒント: 
        </p>
        <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
          <li>👁️ アイコンをクリックして表示/非表示を切り替え</li>
          <li>↑↓ ボタンで順序を変更</li>
          <li>非表示のジャンルは下部に表示されます</li>
        </ul>
      </div>
    </div>
  )
}