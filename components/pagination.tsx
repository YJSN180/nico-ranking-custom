'use client'

import { memo } from 'react'
import { useMediaQuery } from '@/hooks/use-media-query'

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
}

const Pagination = memo(function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange
}: PaginationProps) {
  const isMobile = useMediaQuery('(max-width: 600px)')
  
  if (totalPages <= 1) return null

  const getVisiblePages = () => {
    const delta = 2 // 現在のページの前後に表示するページ数
    const range = []
    const rangeWithDots = []

    // 常に最初のページを含める
    range.push(1)

    // 現在のページ周辺のページを計算
    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
      range.push(i)
    }

    // 常に最後のページを含める（1ページしかない場合を除く）
    if (totalPages > 1) {
      range.push(totalPages)
    }

    let prev = 0
    for (const page of range) {
      if (page - prev === 2) {
        rangeWithDots.push(prev + 1)
      } else if (page - prev !== 1) {
        rangeWithDots.push('...')
      }
      rangeWithDots.push(page)
      prev = page
    }

    return rangeWithDots
  }

  const visiblePages = getVisiblePages()
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '16px',
      padding: '20px 0',
      borderTop: '1px solid var(--border-color)',
      marginTop: '20px'
    }}>
      {/* ページ情報 */}
      <div style={{
        fontSize: '14px',
        color: 'var(--text-secondary)',
        textAlign: 'center'
      }}>
        {startItem}〜{endItem}件を表示 (全{totalItems}件中)
      </div>

      {/* ページネーションコントロール */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        justifyContent: 'center'
      }}>
        {/* 前のページボタン */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          style={{
            padding: '8px 12px',
            fontSize: '14px',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            background: 'var(--surface-color)',
            color: 'var(--text-primary)',
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
            opacity: currentPage === 1 ? 0.5 : 1,
            transition: 'all 0.2s'
          }}
        >
          ← 前
        </button>

        {/* モバイル: 現在/全体 形式、デスクトップ: ページ番号 */}
        {isMobile ? (
          <div style={{
            padding: '8px 12px',
            fontSize: '14px',
            color: 'var(--text-primary)',
            fontWeight: '600'
          }}>
            {currentPage} / {totalPages}
          </div>
        ) : (
          visiblePages.map((page, index) => {
            if (page === '...') {
              return (
                <span
                  key={`dots-${index}`}
                  style={{
                    padding: '8px 4px',
                    color: 'var(--text-secondary)',
                    fontSize: '14px'
                  }}
                >
                  ...
                </span>
              )
            }

            const pageNum = page as number
            const isActive = pageNum === currentPage

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  background: isActive ? 'var(--primary-color)' : 'var(--surface-color)',
                  color: isActive ? 'white' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontWeight: isActive ? '600' : '400',
                  transition: 'all 0.2s',
                  minWidth: '40px'
                }}
              >
                {pageNum}
              </button>
            )
          })
        )}

        {/* 次のページボタン */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          style={{
            padding: '8px 12px',
            fontSize: '14px',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            background: 'var(--surface-color)',
            color: 'var(--text-primary)',
            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
            opacity: currentPage === totalPages ? 0.5 : 1,
            transition: 'all 0.2s'
          }}
        >
          次 →
        </button>
      </div>

      {/* 高速ナビゲーション（モバイル向け） */}
      {totalPages > 10 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>ページ:</span>
          <select
            value={currentPage}
            onChange={(e) => onPageChange(parseInt(e.target.value))}
            style={{
              padding: '4px 8px',
              fontSize: '14px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              background: 'var(--surface-color)',
              color: 'var(--text-primary)'
            }}
          >
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <option key={page} value={page}>
                {page}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
})

export default Pagination