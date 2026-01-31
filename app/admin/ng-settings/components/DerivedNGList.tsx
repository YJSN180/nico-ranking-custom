'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { DERIVED_NG_BULK_DELETE_LIMIT } from '@/lib/admin-ng-constants'
import { useVideoInfo } from '../hooks/useVideoInfo'

interface DerivedNGListProps {
  initialData: string[]
  onUpdate?: (newList: string[]) => void
}

export function DerivedNGList({ initialData, onUpdate }: DerivedNGListProps) {
  const [videoIds, setVideoIds] = useState(initialData)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  
  // AbortController refs
  const deleteAbortControllerRef = useRef<AbortController | null>(null)
  const bulkDeleteAbortControllerRef = useRef<AbortController | null>(null)
  
  const itemsPerPage = 50
  const maxBulkDelete = DERIVED_NG_BULK_DELETE_LIMIT
  const { videoInfo, isLoading } = useVideoInfo(
    videoIds,
    currentPage,
    itemsPerPage,
    searchQuery ? videoIds : []
  )
  
  // 最新リストが渡されたときにUI状態を同期
  useEffect(() => {
    setVideoIds(prev => {
      if (prev.length === initialData.length && prev.every((id, index) => id === initialData[index])) {
        return prev
      }
      return initialData
    })
    setSelectedIds(prev => {
      if (prev.size === 0) return prev
      const next = new Set<string>()
      for (const id of prev) {
        if (initialData.includes(id)) {
          next.add(id)
        }
      }
      return next
    })
    setCurrentPage(prev => {
      const totalPages = Math.max(1, Math.ceil(initialData.length / itemsPerPage))
      return Math.min(prev, totalPages)
    })
  }, [initialData, itemsPerPage])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (deleteAbortControllerRef.current) {
        deleteAbortControllerRef.current.abort()
      }
      if (bulkDeleteAbortControllerRef.current) {
        bulkDeleteAbortControllerRef.current.abort()
      }
    }
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  const syncDerivedList = useCallback(async () => {
    setIsSyncing(true)
    try {
      const response = await fetch('/api/admin/ng-list/derived', {
        credentials: 'same-origin'
      })
      if (!response.ok) {
        throw new Error('Failed to sync derived NG list')
      }
      const data = await response.json()
      const nextList = Array.isArray(data.videoIds) ? data.videoIds : []
      setVideoIds(nextList)
      onUpdate?.(nextList)
      setSelectedIds(new Set())
      setCurrentPage(1)
    } catch (error) {
      alert('派生NGリストの再同期に失敗しました')
    } finally {
      setIsSyncing(false)
    }
  }, [onUpdate])

  // Filter videos based on search query
  const filteredVideoIds = useMemo(() => {
    if (!searchQuery) return videoIds
    
    return videoIds.filter(id => {
      const info = videoInfo[id]
      return id.includes(searchQuery) || 
             (info?.title && info.title.includes(searchQuery))
    })
  }, [videoIds, searchQuery, videoInfo])

  // Pagination
  const totalPages = Math.ceil(filteredVideoIds.length / itemsPerPage)
  const paginatedIds = filteredVideoIds.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  // Handle individual delete
  const handleDelete = async (videoId: string) => {
    if (!confirm(`${videoId} をNGリストから削除しますか？`)) {
      return
    }

    // Cancel previous delete
    if (deleteAbortControllerRef.current) {
      deleteAbortControllerRef.current.abort()
    }
    
    // Create new AbortController
    const controller = new AbortController()
    deleteAbortControllerRef.current = controller

    setIsDeleting(true)
    
    // Optimistic update
    const newList = videoIds.filter(id => id !== videoId)
    setVideoIds(newList)
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      newSet.delete(videoId)
      return newSet
    })
    
    try {
      const response = await fetch(`/api/admin/ng-list/derived/${videoId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error('削除に失敗しました')
      }

    } catch (error: any) {
      // Ignore AbortError
      if (error.name !== 'AbortError') {
        // Rollback on error
        setVideoIds(videoIds)
        alert('削除に失敗しました。もう一度お試しください。')
      }
    } finally {
      // Only update state if not aborted
      if (controller.signal.aborted !== true) {
        setIsDeleting(false)
      }
    }

    if (controller.signal.aborted !== true) {
      await syncDerivedList()
    }
  }

  // Handle bulk delete
  const handleBulkDelete = async () => {
    const idsToDelete = Array.from(selectedIds)
    if (!confirm(`${idsToDelete.length}件の動画をNGリストから削除しますか？`)) {
      return
    }

    // Cancel previous bulk delete
    if (bulkDeleteAbortControllerRef.current) {
      bulkDeleteAbortControllerRef.current.abort()
    }
    
    // Create new AbortController
    const controller = new AbortController()
    bulkDeleteAbortControllerRef.current = controller

    setIsDeleting(true)
    
    // Optimistic update
    const newList = videoIds.filter(id => !selectedIds.has(id))
    setVideoIds(newList)
    setSelectedIds(new Set())
    
    try {
      const failedIds: string[] = []
      for (let i = 0; i < idsToDelete.length; i += maxBulkDelete) {
        if (controller.signal.aborted) break
        const chunk = idsToDelete.slice(i, i + maxBulkDelete)
        try {
          const response = await fetch('/api/admin/ng-list/derived/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            signal: controller.signal,
            body: JSON.stringify({ videoIds: chunk })
          })

          if (!response.ok) {
            failedIds.push(...chunk)
            continue
          }

          const data = await response.json()
          if (Array.isArray(data.failed) && data.failed.length > 0) {
            failedIds.push(...data.failed)
          }
        } catch (error) {
          failedIds.push(...chunk)
        }
      }

      if (failedIds.length > 0) {
        alert(`削除に失敗した動画が${failedIds.length}件あります。再同期します。`)
      }
    } catch (error: any) {
      // Ignore AbortError
      if (error.name !== 'AbortError') {
        // Rollback on error
        setVideoIds(videoIds)
        alert('削除に失敗しました。もう一度お試しください。')
      }
    } finally {
      // Only update state if not aborted
      if (controller.signal.aborted !== true) {
        setIsDeleting(false)
      }
    }

    if (controller.signal.aborted !== true) {
      await syncDerivedList()
    }
  }

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(paginatedIds))
    } else {
      setSelectedIds(new Set())
    }
  }

  // Handle individual checkbox
  const handleCheckboxChange = (videoId: string, checked: boolean) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(videoId)
      } else {
        newSet.delete(videoId)
      }
      return newSet
    })
  }

  return (
    <div style={{ marginTop: '30px' }}>
      <h2>派生NGリスト（{videoIds.length}件）</h2>
      
      {/* Search and controls */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="動画ID・タイトルで検索"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={isDeleting || isSyncing}
          style={{ flex: 1, padding: '8px' }}
        />
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div style={{ marginBottom: '10px', padding: '10px', background: '#f0f0f0' }}>
          <span>選択中: {selectedIds.size}件</span>
          <button
            onClick={handleBulkDelete}
            disabled={isDeleting || isSyncing}
            style={{ marginLeft: '10px' }}
          >
            選択した項目を削除
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && <div>読み込み中...</div>}

      {filteredVideoIds.length === 0 && !isLoading && (
        <div style={{ margin: '20px 0', color: '#666' }}>該当する動画がありません</div>
      )}

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: '10px', textAlign: 'left' }}>
              <input
                type="checkbox"
                aria-label="全選択"
                checked={paginatedIds.length > 0 && paginatedIds.every(id => selectedIds.has(id))}
                onChange={(e) => handleSelectAll(e.target.checked)}
                disabled={isDeleting || isSyncing}
              />
            </th>
            <th style={{ padding: '10px', textAlign: 'left' }}>動画ID</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>タイトル・投稿者</th>
            <th style={{ padding: '10px', textAlign: 'center' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {paginatedIds.map((videoId) => {
            const info = videoInfo[videoId]
            return (
              <tr key={videoId} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(videoId)}
                    onChange={(e) => handleCheckboxChange(videoId, e.target.checked)}
                    disabled={isDeleting || isSyncing}
                  />
                </td>
                <td style={{ padding: '10px' }}>
                  <a
                    href={`https://www.nicovideo.jp/watch/${videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#007cba', textDecoration: 'none' }}
                  >
                    {videoId}
                  </a>
                </td>
                <td style={{ padding: '10px' }}>
                  <div>{info?.title || '読み込み中...'}</div>
                  {info?.authorName && (
                    <div style={{ fontSize: '0.9em', color: '#666' }}>
                      {typeof info.authorName === 'number' ? `投稿者ID: ${info.authorName}` : info.authorName}
                    </div>
                  )}
                </td>
                <td style={{ padding: '10px', textAlign: 'center' }}>
                  <button
                    onClick={() => handleDelete(videoId)}
                    disabled={isDeleting || isSyncing}
                    style={{ cursor: isDeleting || isSyncing ? 'not-allowed' : 'pointer' }}
                  >
                    削除
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            &lt; 前へ
          </button>
          <span>{currentPage} / {totalPages}</span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            次へ &gt;
          </button>
        </div>
      )}
    </div>
  )
}
