'use client'

import { memo } from 'react'
import styles from './pagination.module.css'

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
  
  if (totalPages <= 1) return null

  const getVisiblePages = () => {
    const delta = 2 // 現在のページの前後に表示するページ数
    const range: number[] = []
    const rangeWithDots: (number | string)[] = []

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

  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1)
    }
  }

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1)
    }
  }

  const visiblePages = getVisiblePages()

  return (
    <nav className={styles.container} role="navigation" aria-label="ページネーション">
      <div className={styles.pageInfo}>
        {startItem}〜{endItem}件を表示 (全{totalItems}件中)
      </div>

      <div className={styles.buttonContainer}>
        {/* 前へボタン */}
        <button
          className={styles.navButton}
          onClick={handlePrevious}
          disabled={currentPage === 1}
          aria-label="前のページへ"
        >
          ← 前
        </button>

        {/* デスクトップ用: ページ番号列挙 */}
        <div className={styles.pageNumbers} data-testid="page-numbers">
          {visiblePages.map((page, index) => {
            if (page === '...') {
              return (
                <span
                  key={`dots-${index}`}
                  className={styles.dots}
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
                className={`${styles.pageButton} ${isActive ? styles.active : ''}`}
                onClick={() => onPageChange(pageNum)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={`ページ ${pageNum}`}
              >
                {pageNum}
              </button>
            )
          })}
        </div>

        {/* モバイル用: ページサマリー */}
        <div className={styles.pageSummary} data-testid="page-summary">
          {currentPage} / {totalPages}
        </div>

        {/* 次へボタン */}
        <button
          className={styles.navButton}
          onClick={handleNext}
          disabled={currentPage === totalPages}
          aria-label="次のページへ"
        >
          次 →
        </button>
      </div>

    </nav>
  )
})

export default Pagination