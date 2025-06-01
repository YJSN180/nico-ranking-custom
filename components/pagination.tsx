'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

interface PaginationProps {
  currentPage: number
  totalItems: number
  itemsPerPage: number
  position?: 'top' | 'bottom'
}

export function Pagination({ currentPage, totalItems, itemsPerPage, position = 'bottom' }: PaginationProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  
  const createPageUrl = useCallback((page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (page === 1) {
      params.delete('page') // 1ページ目はパラメータを削除
    } else {
      params.set('page', page.toString())
    }
    const queryString = params.toString()
    return queryString ? `?${queryString}` : '/'
  }, [searchParams])
  
  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return
    router.push(createPageUrl(page))
  }
  
  // ページ番号の配列を生成
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    
    if (totalPages <= 7) {
      // 7ページ以下なら全部表示
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // 7ページ以上の場合は省略表示
      if (currentPage <= 4) {
        // 最初の方
        for (let i = 1; i <= 5; i++) pages.push(i)
        pages.push('...')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 3) {
        // 最後の方
        pages.push(1)
        pages.push('...')
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i)
      } else {
        // 中間
        pages.push(1)
        pages.push('...')
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i)
        pages.push('...')
        pages.push(totalPages)
      }
    }
    
    return pages
  }
  
  if (totalPages <= 1) return null
  
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)
  
  return (
    <div style={{
      padding: '20px 0',
      textAlign: 'center',
      background: position === 'top' ? 'linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(255,255,255,0))' : 'linear-gradient(to top, rgba(255,255,255,0.9), rgba(255,255,255,0))'
    }}>
      {position === 'top' && (
        <div style={{ 
          fontSize: '14px', 
          color: '#666',
          marginBottom: '12px'
        }}>
          全{totalItems}件中 {startItem}-{endItem}位を表示中
        </div>
      )}
      
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        gap: '4px',
        flexWrap: 'wrap'
      }}>
        {/* 前へボタン */}
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          style={{
            padding: '8px 12px',
            border: '1px solid #e5e5e5',
            borderRadius: '4px',
            background: 'white',
            color: currentPage === 1 ? '#ccc' : '#333',
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
        >
          &lt; 前へ
        </button>
        
        {/* ページ番号 */}
        {getPageNumbers().map((page, index) => (
          <div key={index}>
            {page === '...' ? (
              <span style={{ padding: '0 8px', color: '#999' }}>...</span>
            ) : (
              <button
                onClick={() => handlePageChange(page as number)}
                style={{
                  padding: '8px 12px',
                  minWidth: '40px',
                  border: '1px solid',
                  borderColor: currentPage === page ? '#667eea' : '#e5e5e5',
                  borderRadius: '4px',
                  background: currentPage === page ? '#667eea' : 'white',
                  color: currentPage === page ? 'white' : '#333',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: currentPage === page ? '600' : '500',
                  transition: 'all 0.2s ease'
                }}
              >
                {page}
              </button>
            )}
          </div>
        ))}
        
        {/* 次へボタン */}
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          style={{
            padding: '8px 12px',
            border: '1px solid #e5e5e5',
            borderRadius: '4px',
            background: 'white',
            color: currentPage === totalPages ? '#ccc' : '#333',
            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
        >
          次へ &gt;
        </button>
      </div>
      
      {position === 'bottom' && (
        <div style={{ 
          fontSize: '12px', 
          color: '#999',
          marginTop: '12px'
        }}>
          {startItem}-{endItem}位 / 全{totalItems}件
        </div>
      )}
    </div>
  )
}