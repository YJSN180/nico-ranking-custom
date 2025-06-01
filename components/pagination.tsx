'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface PaginationProps {
  currentPage: number
  totalItems: number
  itemsPerPage: number
  position?: 'top' | 'bottom'
}

export function Pagination({ 
  currentPage, 
  totalItems, 
  itemsPerPage,
  position = 'bottom' 
}: PaginationProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  
  if (totalPages <= 1) return null
  
  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams)
    if (page === 1) {
      params.delete('page')
    } else {
      params.set('page', page.toString())
    }
    router.push(`?${params.toString()}`)
  }
  
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisible = 7
    
    if (totalPages <= maxVisible) {
      // 全ページ表示
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // 省略表示
      if (currentPage <= 3) {
        for (let i = 1; i <= 5; i++) {
          pages.push(i)
        }
        pages.push('...')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 2) {
        pages.push(1)
        pages.push('...')
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i)
        }
      } else {
        pages.push(1)
        pages.push('...')
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i)
        }
        pages.push('...')
        pages.push(totalPages)
      }
    }
    
    return pages
  }
  
  const pageNumbers = getPageNumbers()
  
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '8px',
      padding: '20px',
      flexWrap: 'wrap'
    }}>
      <button
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage === 1}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          background: currentPage === 1 ? '#f5f5f5' : '#fff',
          color: currentPage === 1 ? '#999' : '#333',
          cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
          fontSize: '14px'
        }}
      >
        前へ
      </button>
      
      {pageNumbers.map((page, index) => (
        <div key={index}>
          {page === '...' ? (
            <span style={{ padding: '0 8px', color: '#999' }}>...</span>
          ) : (
            <button
              onClick={() => handlePageChange(page as number)}
              disabled={page === currentPage}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                background: page === currentPage ? '#667eea' : '#fff',
                color: page === currentPage ? '#fff' : '#333',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: page === currentPage ? 'bold' : 'normal'
              }}
            >
              {page}
            </button>
          )}
        </div>
      ))}
      
      <button
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          background: currentPage === totalPages ? '#f5f5f5' : '#fff',
          color: currentPage === totalPages ? '#999' : '#333',
          cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
          fontSize: '14px'
        }}
      >
        次へ
      </button>
      
      <span style={{
        marginLeft: '16px',
        fontSize: '14px',
        color: '#666'
      }}>
        {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, totalItems)} / {totalItems}件
      </span>
    </div>
  )
}