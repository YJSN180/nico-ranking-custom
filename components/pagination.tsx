'use client'

import { memo, useEffect, useId, useRef, useState } from 'react'
import styles from './pagination.module.css'

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  enableQuickNavigation?: boolean
  showSinglePageSummary?: boolean
  className?: string
}

const Pagination = memo(function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  enableQuickNavigation = false,
  showSinglePageSummary = false,
  className = '',
}: PaginationProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pageInput, setPageInput] = useState(String(currentPage))
  const [inputError, setInputError] = useState('')

  useEffect(() => {
    setPageInput(String(currentPage))
    setInputError('')
  }, [currentPage, totalPages])

  if (totalPages <= 1) {
    if (!showSinglePageSummary) return null
    return (
      <div className={`${styles.container} ${className}`}>
        <div className={styles.pageInfo}>
          {totalItems === 0 ? 0 : 1}〜{Math.min(itemsPerPage, totalItems)}
          件を表示 (全{totalItems}件中)
        </div>
      </div>
    )
  }

  const getVisiblePages = () => {
    const delta = 2 // 現在のページの前後に表示するページ数
    const range = []
    const rangeWithDots = []

    // 常に最初のページを含める
    range.push(1)

    // 現在のページ周辺のページを計算
    for (
      let i = Math.max(2, currentPage - delta);
      i <= Math.min(totalPages - 1, currentPage + delta);
      i++
    ) {
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
    <nav
      className={`${styles.container} ${className}`}
      role="navigation"
      aria-label="ページネーション"
    >
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
                <span key={`dots-${index}`} className={styles.dots}>
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
        {enableQuickNavigation ? (
          <button
            type="button"
            className={`${styles.pageSummary} ${styles.summaryButton}`}
            data-testid="page-summary"
            aria-label={`現在 ${currentPage} / ${totalPages} ページ。ページ番号を入力`}
            onClick={() => {
              inputRef.current?.focus()
              inputRef.current?.select()
            }}
          >
            {currentPage} / {totalPages}
          </button>
        ) : (
          <div className={styles.pageSummary} data-testid="page-summary">
            {currentPage} / {totalPages}
          </div>
        )}

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

      {enableQuickNavigation && (
        <div className={styles.quickNavigation}>
          <div className={styles.jumpButtons}>
            <button
              type="button"
              className={styles.navButton}
              disabled={currentPage <= 1}
              onClick={() => onPageChange(Math.max(1, currentPage - 10))}
            >
              10ページ前
            </button>
            <button
              type="button"
              className={styles.navButton}
              disabled={currentPage >= totalPages}
              onClick={() =>
                onPageChange(Math.min(totalPages, currentPage + 10))
              }
            >
              10ページ先
            </button>
          </div>
          <form
            className={styles.jumpForm}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              const value = pageInput.trim()
              const nextPage = Number(value)
              if (
                !/^\d+$/.test(value) ||
                !Number.isSafeInteger(nextPage) ||
                nextPage < 1 ||
                nextPage > totalPages
              ) {
                setInputError(
                  `1〜${totalPages.toLocaleString()}の整数を入力してください`,
                )
                inputRef.current?.focus()
                return
              }
              setInputError('')
              setPageInput(String(nextPage))
              if (nextPage !== currentPage) onPageChange(nextPage)
            }}
          >
            <label htmlFor={inputId}>ページ</label>
            <input
              ref={inputRef}
              id={inputId}
              className={styles.pageInput}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={pageInput}
              aria-label="移動先のページ番号"
              aria-describedby={`${inputId}-range${inputError ? ` ${inputId}-error` : ''}`}
              aria-invalid={!!inputError}
              onChange={(event) => {
                setPageInput(event.target.value)
                setInputError('')
              }}
            />
            <span id={`${inputId}-range`}>/ {totalPages.toLocaleString()}</span>
            <button className={styles.navButton} type="submit">
              移動
            </button>
            {inputError && (
              <p
                id={`${inputId}-error`}
                className={styles.inputError}
                role="alert"
              >
                {inputError}
              </p>
            )}
          </form>
        </div>
      )}
    </nav>
  )
})

export default Pagination
