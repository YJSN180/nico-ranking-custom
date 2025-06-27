'use client'

import { useState, useEffect } from 'react'
import { useMylistOperations } from '@/hooks/use-mylist-operations'
import type { RankingItem } from '@/types/ranking'
import type { Video } from '@/lib/storage/types'

interface MylistButtonProps {
  video: RankingItem
}

export function MylistButton({ video }: MylistButtonProps) {
  const { mylists, isLoading, addVideoToMylist, removeVideoFromMylist, isVideoInAnyMylist } = useMylistOperations()
  const [isInMylist, setIsInMylist] = useState(false)
  const [mylistIds, setMylistIds] = useState<string[]>([])
  const [showModal, setShowModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    const checkStatus = async () => {
      const result = await isVideoInAnyMylist(video.id)
      setIsInMylist(result.inMylist)
      setMylistIds(result.mylistIds)
    }
    
    if (!isLoading) {
      checkStatus()
    }
  }, [video.id, isLoading, isVideoInAnyMylist])

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isInMylist) {
      // Remove from all mylists
      handleRemoveFromAll()
    } else {
      // Show mylist selection modal
      setShowModal(true)
    }
  }

  const handleRemoveFromAll = async () => {
    setIsProcessing(true)
    try {
      for (const mylistId of mylistIds) {
        await removeVideoFromMylist(mylistId, video.id)
      }
      setIsInMylist(false)
      setMylistIds([])
    } catch (error) {
      console.error('Failed to remove from mylists:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleAddToMylist = async (mylistId: string) => {
    setIsProcessing(true)
    try {
      const videoData: Video = {
        id: video.id,
        title: video.title,
        thumbURL: video.thumbURL || '',
        viewCount: video.views || 0,
        commentCount: video.comments || 0,
        mylistCount: video.mylists || 0,
        duration: video.duration || 0,
        authorName: video.authorName || '',
        authorId: video.authorId || '',
        registeredAt: video.registeredAt,
        tags: video.tags || []
      }
      
      const success = await addVideoToMylist(mylistId, videoData)
      if (success) {
        setIsInMylist(true)
        setMylistIds([...mylistIds, mylistId])
        setShowModal(false)
      }
    } catch (error) {
      console.error('Failed to add to mylist:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return null
  }

  return (
    <>
      <button
        aria-label={isInMylist ? "マイリストから削除" : "マイリストに追加"}
        onClick={handleClick}
        disabled={isProcessing}
        style={{
          background: isInMylist ? 'var(--success-color)' : 'var(--surface-color)',
          border: `1px solid ${isInMylist ? 'var(--success-color)' : 'var(--border-color)'}`,
          borderRadius: '20px',
          padding: '6px',
          cursor: isProcessing ? 'wait' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isInMylist ? 'white' : 'var(--text-secondary)',
          transition: 'all 0.2s',
          opacity: isProcessing ? 0.6 : 1,
          width: '32px',
          height: '32px',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!isProcessing && !isInMylist) {
            e.currentTarget.style.background = 'var(--surface-hover)'
            e.currentTarget.style.borderColor = 'var(--primary-color)'
            e.currentTarget.style.color = 'var(--primary-color)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isProcessing && !isInMylist) {
            e.currentTarget.style.background = 'var(--surface-color)'
            e.currentTarget.style.borderColor = 'var(--border-color)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }
        }}
        title={isInMylist ? "マイリストから削除" : "マイリストに追加"}
      >
        <span style={{ fontSize: '16px', lineHeight: 1 }}>{isInMylist ? '✓' : '+'}</span>
      </button>

      {/* マイリスト選択モーダル */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '400px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: '18px' }}>マイリストに追加</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {mylists.map((mylist) => (
                <button
                  key={mylist.id}
                  onClick={() => handleAddToMylist(mylist.id)}
                  disabled={isProcessing || mylistIds.includes(mylist.id)}
                  style={{
                    padding: '12px 16px',
                    background: mylistIds.includes(mylist.id) ? 'var(--bg-secondary)' : 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    textAlign: 'left',
                    cursor: isProcessing || mylistIds.includes(mylist.id) ? 'default' : 'pointer',
                    opacity: mylistIds.includes(mylist.id) ? 0.6 : 1,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isProcessing && !mylistIds.includes(mylist.id)) {
                      e.currentTarget.style.background = 'var(--surface-hover)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isProcessing && !mylistIds.includes(mylist.id)) {
                      e.currentTarget.style.background = 'var(--surface-color)'
                    }
                  }}
                >
                  <div style={{ fontWeight: '500' }}>
                    {mylist.name}
                    {mylistIds.includes(mylist.id) && ' ✓'}
                  </div>
                  {mylist.description && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {mylist.description}
                    </div>
                  )}
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {mylist.videoCount}件の動画
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowModal(false)}
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </>
  )
}