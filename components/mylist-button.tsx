'use client'

import { useState, useEffect } from 'react'
import { useMylistOperations } from '@/hooks/use-mylist-operations'
import { MylistModal } from './mylist-modal'
import type { RankingItem } from '@/types/ranking'
import type { Video } from '@/lib/storage/types'

interface MylistButtonProps {
  video: RankingItem
}

export function MylistButton({ video }: MylistButtonProps) {
  // SSR時はnullを返す
  const [isClient, setIsClient] = useState(false)
  const { mylists, isLoading, addVideoToMylist, removeVideoFromMylist, isVideoInAnyMylist, createMylist } = useMylistOperations()
  const [isInMylist, setIsInMylist] = useState(false)
  const [mylistIds, setMylistIds] = useState<string[]>([])
  const [showModal, setShowModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // クライアントサイドでのみ実行
  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const result = await isVideoInAnyMylist(video.id)
        setIsInMylist(result.inMylist)
        setMylistIds(result.mylistIds)
      } catch (error) {
        // エラーが発生してもUIは正常に表示
        // eslint-disable-next-line no-console
        console.error('Failed to check mylist status:', error)
        setIsInMylist(false)
        setMylistIds([])
      }
    }
    
    if (!isLoading) {
      checkStatus()
    }
  }, [video.id, isLoading, isVideoInAnyMylist])

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    
    // デバッグログ
    // eslint-disable-next-line no-console
    console.log('[MylistButton] clicked', { isInMylist, mylists, isLoading })
    
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
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
      console.error('Failed to add to mylist:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  // SSR時またはクライアント側の初期化前はプレースホルダーを表示
  if (!isClient || isLoading) {
    return (
      <div 
        data-testid="mylist-button-placeholder"
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '20px',
          background: 'var(--surface-secondary)',
          opacity: 0.5,
          flexShrink: 0,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
        title="読み込み中..."
      />
    )
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
        <MylistModal
          mylists={mylists}
          selectedMylistIds={mylistIds}
          onAddToMylist={async (mylistId) => {
            await handleAddToMylist(mylistId)
          }}
          onClose={() => setShowModal(false)}
          onCreateMylist={async (name, description) => {
            const newMylistId = await createMylist(name, description)
            if (newMylistId) {
              await handleAddToMylist(newMylistId)
            }
          }}
          isProcessing={isProcessing}
        />
      )}
    </>
  )
}